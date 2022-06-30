import { LoaderContext, Dependency } from 'webpack';
import { BuildContext, Module } from '../builder';
import _path from 'path';
import { Resource, Handler, Source } from '../api';
import { SourceContext } from '../builder/SourceContext';
import { createComposable } from '@grexie/compose';

interface ModuleLoaderOptions {
  context: BuildContext;
  handler?: string;
}

export default async function ModuleLoader(
  this: LoaderContext<ModuleLoaderOptions>,
  content: Buffer
) {
  console.info('module-loader', this.resourcePath);

  const { context, ...options } = this.getOptions();
  const factory = context.modules.createModuleFactory(this._compilation!);

  await context.modules.evict(factory, this.resourcePath, { recompile: true });
  const path = context.builder.filenameToPath(this.resourcePath);

  const configModule = await context.config.create(factory, path);
  configModule.ancestors.forEach(({ module }) => {
    if (module) {
      this.addDependency(module.filename);
    }
  });

  const createHandler = async () => {
    let handlerModule: Module;
    if (typeof options.handler === 'string') {
      handlerModule = await context.modules.require(
        factory,
        this._module!.context!,
        options.handler
      );
    } else {
      handlerModule = await context.modules.create(
        factory,
        this._module!,
        this.resourcePath,
        content.toString()
      );
    }
    return handlerModule;
  };

  let handlerModule = await createHandler();

  const handler = handlerModule.load(module).exports as Handler;
  const handlerConfig = { metadata: {} };
  // const config = configModule.create(handlerModule.module, handlerConfig);
  const config = handlerConfig;

  let resource: Resource | undefined = undefined;

  const sourceContext = new SourceContext({
    factory,
    context,
    module: handlerModule,
    content,
    filename: this.resourcePath,
    path,
    config,
  });

  if (typeof handler.resource === 'function') {
    resource = await handler.resource(sourceContext);
  }

  if (!resource) {
    resource = sourceContext.create();
  }

  const composables = [];
  const composablesRequires = [];
  let layouts = sourceContext.metadata.layout ?? [];
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
      factory,
      _path.dirname(this.resourcePath),
      layout
    );

    this.addDependency(layoutModule.filename);

    composables.push(
      createComposable(layoutModule.load(handlerModule.module!).exports.default)
    );
  }

  await context.modules.evict(factory, this.resourcePath, { recompile: true });
  sourceContext.emit('end');

  if (options.handler) {
    return `
      const { wrapHandler } = require("@grexie/pages");
      const { createComposable } = require("@grexie/compose");
      const resource = ${resource.serialize()};
      const handler = require(${JSON.stringify(options.handler)});
      wrapHandler(exports, resource, handler, ${composablesRequires
        .map(id => `createComposable(require(${JSON.stringify(id)}).default)`)
        .join(',\n')}
      );
    `;
  } else {
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
