import { LoaderContext } from 'webpack';
import { BuildContext, Module } from '..';
import _path from 'path';
import { Resource, Handler } from '../../api';
import { SourceContext } from '../SourceContext';
import { createComposable } from '@grexie/compose';
import { createResolver } from '../../utils/resolvable';
import babel, { PluginObj, PluginPass, transformAsync } from '@babel/core';

interface ModuleLoaderOptions {
  context: BuildContext;
  handler?: string;
}

export default async function ModuleLoader(
  this: LoaderContext<ModuleLoaderOptions>,
  content: Buffer
) {
  let phase = 0;

  if (process.env.PAGES_DEBUG_LOADERS === 'true') {
    console.info('module-loader', this.resourcePath);
  }

  phase = 1;
  const { context, ...options } = this.getOptions();
  const resolver = createResolver();
  await context.modules.addBuild(this.resourcePath, resolver);

  phase = 2;
  try {
    const factory = context.modules.createModuleFactory(this._compilation!);

    phase = 3;
    await context.modules.evict(factory, this.resourcePath, {
      recompile: true,
      fail: false,
    });
    phase = 4;
    const path = context.builder.filenameToPath(this.resourcePath);

    phase = 5;
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

    phase = 6;

    let handlerModule = await createHandler();

    phase = 7;
    const configModule = await context.config.create(factory, path);
    configModule.ancestors.forEach(({ module }) => {
      if (module) {
        this.addDependency(module.filename);
      }
    });
    await handlerModule.load();

    phase = 8;
    const handler = handlerModule.exports as Handler;
    const handlerConfig = { metadata: {} };
    phase = 29;
    const configPromise = configModule.create(handlerConfig);
    phase = 30;
    console.info(Object.getPrototypeOf(configPromise) === Promise);
    const config = await configPromise;

    phase = 9;
    let resource: Resource | undefined = undefined;

    const sourceContext = new SourceContext({
      factory,
      context,
      module: handlerModule,
      content,
      filename: this.resourcePath,
      path,
      configModule,
      config,
    });

    phase = 10;
    if (typeof handler.resource === 'function') {
      resource = await handler.resource(sourceContext);
    }
    phase = 11;

    if (!resource) {
      resource = sourceContext.create();
    }

    phase = 12;
    console.info(this.resourcePath, resource);

    const composables = [];
    const composablesRequires = [];
    let layouts = sourceContext.metadata.layout ?? [];
    if (!Array.isArray(layouts)) {
      layouts = [layouts];
    }

    for (let layout of layouts) {
      phase = 13;
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

      phase = 44;
      const layoutModule = await context.modules.require(
        factory,
        _path.dirname(this.resourcePath),
        layout
      );

      phase = 45;
      this.addDependency(layoutModule.filename);

      phase = 46;
      await layoutModule.load();
      phase = 47;
      composables.push(createComposable(layoutModule.exports.default));
    }

    phase = 14;

    sourceContext.emit('end');

    phase = 15;
    const serializedResource = await sourceContext.serialize(resource);

    if (options.handler) {
      resolver.resolve();

      const source = `
      import { wrapHandler } from '@grexie/pages/api/Handler';
      ${
        composablesRequires.length
          ? 'import { createComposable } from "@grexie/compose";'
          : ''
      }
      import handler from ${JSON.stringify(options.handler)};
      ${serializedResource}
      export default wrapHandler(resource, handler, ${composablesRequires
        .map(id => `createComposable(require(${JSON.stringify(id)}).default)`)
        .join(',\n')}
      );
    `;
      console.info(source);
      phase = 16;
      return source;
    } else {
      await context.modules.evict(factory, this.resourcePath, {
        recompile: true,
      });

      const compiled = await transformAsync(
        handlerModule.webpackModule.originalSource()!.buffer().toString(),
        {
          plugins: [handlerModulePlugin],
        }
      );

      resolver.resolve();

      const source = `
      ${compiled!.code}
      import { wrapHandler } from "@grexie/pages/api/Handler";
      ${
        composablesRequires.length
          ? 'import { createComposable } from "@grexie/compose";'
          : ''
      }
      ${serializedResource};
      export default wrapHandler(resource, __handler_component, ${composablesRequires
        .map(id => `createComposable(require(${JSON.stringify(id)}).default)`)
        .join(',\n')});
    `;
      console.info(source);
      phase = 17;
      return source;
    }
  } catch (err) {
    console.error(this.resourcePath, phase, err);
    resolver.reject(err);
    throw err;
  } finally {
    if (process.env.PAGES_DEBUG_LOADERS === 'true') {
      console.info('module-loader:complete', this.resourcePath);
    }
  }
}

const handlerModulePlugin: (b: typeof babel) => PluginObj<PluginPass> = ({
  types: t,
}) => ({
  visitor: {
    ExportDefaultDeclaration(path) {
      path.replaceWith(
        t.variableDeclaration('const', [
          t.variableDeclarator(
            t.identifier('__handler_component'),
            path.node.declaration as any
          ),
        ])
      );
    },
    ExportNamedDeclaration(path) {
      if (path.node.declaration) {
        if (t.isVariableDeclaration(path.node.declaration)) {
          for (const declaration of path.node.declaration.declarations) {
            if (t.isVariableDeclarator(declaration)) {
              if (t.isIdentifier((declaration as any).id)) {
                const { name } = (declaration as any).id;
                if (name === 'resource') {
                  const index =
                    path.node.declaration.declarations.indexOf(declaration);
                  path.node.declaration.declarations.splice(index, 1);
                }
              }
            }
          }
          if (path.node.declaration.declarations.length) {
            path.replaceWith(path.node);
          } else {
            path.remove();
          }
        } else if (t.isFunctionDeclaration(path.node.declaration)) {
          if (t.isIdentifier((path.node.declaration as any).id)) {
            const { name } = (path.node.declaration as any).id;
            if (name === 'resource') {
              path.remove();
            }
          }
        }
      }
    },
  },
});
