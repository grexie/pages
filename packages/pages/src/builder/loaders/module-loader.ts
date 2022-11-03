import { LoaderContext } from 'webpack';
import { BuildContext } from '../BuildContext.js';
import { Module } from '../ModuleContext.js';
import _path from 'path';
import { Resource } from '../../api/Resource.js';
import { Handler } from '../../api/Handler.js';
import { SourceContext } from '../SourceContext.js';
import { createComposable } from '@grexie/compose';
import { createResolver } from '../../utils/resolvable.js';
import babel, { PluginObj, PluginPass, transformAsync } from '@babel/core';
import babelEnvPreset from '@babel/preset-env';

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

    const handler = handlerModule.exports as Handler;
    const handlerConfig = { metadata: {} };

    const configPromise = configModule.create(handlerConfig);

    const config = await configPromise;

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
      import { wrapHandler as __pages_wrap_handler } from "@grexie/pages/api/Handler";
      ${
        composablesRequires.length
          ? 'import { createComposable as __pages_create_composable } from "@grexie/compose";'
          : ''
      }
      ${composablesRequires
        .map(
          (id, i) =>
            `import __pages_composable_${i} from ${JSON.stringify(id)};`
        )
        .join(',\n')}
      import __pages_handler_component from ${JSON.stringify(options.handler)};
        
      ${serializedResource};
      export default __pages_wrap_handler(
        resource,
        __pages_handler_component,
        ${composablesRequires
          .map((_, i) => `__pages_create_composable(__pages_composable_${i})`)
          .join(',\n')}
      );
    `;

      return source;
    } else {
      const compiled = await transformAsync(content.toString(), {
        presets: [[babelEnvPreset, { modules: false }]],
        plugins: [handlerModulePlugin],
      });

      await context.modules.evict(factory, this.resourcePath, {
        recompile: true,
      });

      resolver.resolve();

      const source = `
      import { wrapHandler as __pages_wrap_handler } from "@grexie/pages/api/Handler";
      ${
        composablesRequires.length
          ? 'import { createComposable as __pages_create_composable } from "@grexie/compose";'
          : ''
      }
      ${composablesRequires
        .map(
          (id, i) =>
            `import __pages_composable_${i} from ${JSON.stringify(id)};`
        )
        .join(',\n')}
      
      ${compiled!.code}
        
      ${serializedResource};
      export default __pages_wrap_handler(
        resource,
        __pages_handler_component,
        ${composablesRequires
          .map((_, i) => `__pages_create_composable(__pages_composable_${i})`)
          .join(',\n')}
      );
    `;

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
    ExportDefaultDeclaration(path: any) {
      path.replaceWith(
        t.variableDeclaration('const', [
          t.variableDeclarator(
            t.identifier('__pages_handler_component'),
            path.node.declaration as any
          ),
        ])
      );
    },
    ExportNamedDeclaration(path: any) {
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
