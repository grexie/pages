import type { LoaderContext } from 'webpack';
import { BuildContext, Module } from '../builder';
import _path from 'path';
import { WritableBuffer } from '../utils/stream';
import { Resource, Handler } from '../api';
import { withResource } from '../hooks';
import { SourceContext } from '../builder/SourceContext';
import { createComposable } from '@grexie/compose';

interface LoaderOptions {
  context: BuildContext;
  handler?: string;
}

export default async function PagesLoader(
  this: LoaderContext<LoaderOptions>,
  content: Buffer
) {
  const { context, ...options } = this.getOptions();
  context.modules.evict(this.resourcePath, { recompile: true });
  const path = context.builder.filenameToPath(this.resourcePath);
  const filename = _path.join(...path, 'index.html');

  const createHandler = async () => {
    let handlerModule: Module;
    if (typeof options.handler === 'string') {
      handlerModule = await context.modules.require(
        resolver,
        this._module!.context!,
        options.handler
      );
    } else {
      handlerModule = await context.modules.create(
        resolver,
        this._module!.context!,
        this.resourcePath,
        content.toString()
      );
    }
    return handlerModule;
  };

  const resolver = context.modules.createResolver(this);
  let handlerModule = await createHandler();

  const handler = handlerModule.load(module).exports as Handler;

  let resource: Resource | undefined = undefined;
  const sourceContext = new SourceContext({
    resolver,
    context,
    module: handlerModule,
    content,
    filename: this.resourcePath,
    path,
  });

  if (typeof handler.resource === 'function') {
    resource = await handler.resource(sourceContext);
  }

  if (!resource) {
    return handlerModule.source;
  }

  const composables = [];
  const composablesRequires = [];
  let layouts = resource.metadata.layout ?? [];
  if (!Array.isArray(layouts)) {
    layouts = [layouts];
  }

  for (let layout of layouts) {
    if (/^\./.test(layout)) {
      layout = _path.resolve(_path.dirname(this.resourcePath), layout);
      composablesRequires.push(
        `./${_path.relative(_path.dirname(this.resourcePath), layout)}`
      );
    } else if (/^\//.test(layout)) {
      layout = _path.resolve(context.rootDir, layout.substring(1));
      composablesRequires.push(
        `./${_path.relative(_path.dirname(this.resourcePath), layout)}`
      );
    } else {
      composablesRequires.push(layout);
    }

    const layoutModule = await context.modules.require(
      resolver,
      this.resourcePath,
      layout
    );

    this.addDependency(layoutModule.filename);

    composables.push(
      createComposable(layoutModule.load(handlerModule.module!).exports.default)
    );
  }

  if (handler.default) {
    try {
      const buffer = await context.renderer.render(
        new WritableBuffer(),
        resource,
        ...composables,
        withResource({ resource }),
        handler.default
      );
      this.emitFile(filename, buffer);
    } catch (err) {
      if (!(err instanceof Error)) {
        err = new Error(String(err));
      }
      this.emitError(err as Error);
    }
  }

  if (options.handler) {
    sourceContext.emit('end');

    const out = `
      const { wrapHandler } = require("@grexie/pages");
      const { createComposable } = require("@grexie/compose");
      const resource = ${resource.serialize()};
      const handler = require(${JSON.stringify(options.handler)});
      wrapHandler(exports, resource, handler, ${composablesRequires
        .map(id => `createComposable(require(${JSON.stringify(id)}).default)`)
        .join(',\n')}
      );
    `;
    return out;
  } else {
    context.modules.evict(this.resourcePath, { recompile: true });
    sourceContext.emit('end');

    return `
      (() => {
        ${handlerModule.source}
      })();
      const { wrapHandler } = require("@grexie/pages");
      const { createComposable } = require("@grexie/compose");
      const resource = ${resource.serialize()};
      wrapHandler(exports, resource, exports,
        ${composablesRequires
          .map(id => `createComposable(require(${JSON.stringify(id)}).default)`)
          .join(',\n')}
      );
    `;
  }
}
