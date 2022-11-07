import { LoaderContext } from 'webpack';
import { BuildContext } from '../BuildContext.js';
import { InstantiatedModule } from '../ModuleLoader.js';
import _path from 'path';
import { Resource } from '../../api/Resource.js';
import { Handler } from '../../api/Handler.js';
import { SourceContext } from '../SourceContext.js';
import { createComposable } from '@grexie/compose';
import { createResolver } from '../../utils/resolvable.js';
import * as babel from '@babel/core';
import { PluginObj, PluginPass, transformAsync } from '@babel/core';
import babelEnvPreset from '@babel/preset-env';
import reactRefreshPlugin from 'react-refresh/babel';
import { offsetLines } from '../../utils/source-maps.js';

interface ModuleLoaderOptions {
  context: BuildContext;
  handler?: string;
}

export default async function ModuleLoader(
  this: LoaderContext<ModuleLoaderOptions>,
  content: Buffer,
  inputSourceMap: any
) {
  const callback = this.async();

  if (process.env.PAGES_DEBUG_LOADERS === 'true') {
    console.info('module-loader', this.resourcePath);
  }

  const { context, ...options } = this.getOptions();
  const resolver = createResolver();
  // await context.modules.addBuild(this.resourcePath, resolver);

  try {
    // const factory = context.modules.createModuleFactory(this._compilation!);
    const modules = context.getModuleContext(this._compilation!);

    // await context.modules.evict(factory, `${this.resourcePath}$original`, {
    //   recompile: true,
    //   fail: false,
    // });
    // await context.modules.evict(factory, this.resourcePath, {
    //   recompile: true,
    //   fail: false,
    // });

    const path = context.builder.filenameToPath(this.resourcePath);

    const createHandler = async () => {
      let handlerModule: InstantiatedModule;
      if (typeof options.handler === 'string') {
        handlerModule = await modules.require(
          this._module!.context!,
          options.handler
        );
      } else {
        handlerModule = await modules.create(
          this._module!.context!,
          this.resourcePath,
          content.toString()
        );
      }
      return handlerModule;
    };

    let handlerModule = await createHandler();

    console.info('created handler module');
    
    const configModule = await context.config.create(this._compilation!, path);
    configModule.ancestors.forEach(({ module }) => {
      if (module) {
        this.addDependency(module.filename);
      }
    });

    const handler = handlerModule.exports as Handler;
    const handlerConfig = { metadata: {} };

    const configPromise = configModule.create(handlerConfig);

    const config = await configPromise;

    let resource: Resource | undefined = undefined;

    const sourceContext = new SourceContext({
      compilation: this._compilation!,
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

      const layoutModule = await modules.require(
        _path.dirname(this.resourcePath),
        layout
      );

      this.addDependency(layoutModule.filename);

      composables.push(createComposable(layoutModule.exports.default));
    }

    sourceContext.emit('end');

    const serializedResource = await sourceContext.serialize(resource);

    const hmrHeader = `
      import __pages_refresh_runtime from '@grexie/pages/runtime/hmr';

      const __pages_refresh_global = typeof window === 'undefined' ? global : window;
      const __pages_previous_refreshreg = __pages_refresh_global.$RefreshReg$;
      const __pages_previous_refreshsig = __pages_refresh_global.$RefreshSig$;

      __pages_refresh_global.$RefreshReg$ = (type, id) => {
        const fullId = import.meta.url + ' ' + id;
        __pages_refresh_runtime.register(type, fullId);
      };
      __pages_refresh_global.$RefreshSig$ = __pages_refresh_runtime.createSignatureFunctionForTransform;
    `;

    const hmrFooter = `
      if (import.meta.webpackHot) {
        import.meta.webpackHot.accept();
        __pages_refresh_runtime.update();
      }
      __pages_refresh_global.$RefreshReg$ = __pages_previous_refreshreg;
      __pages_refresh_global.$RefreshSig$ = __pages_previous_refreshsig;
    `;

    if (options.handler) {
      resolver.resolve();

      const header = `
        import { wrapHandler as __pages_wrap_handler, hydrate as __pages_hydrate } from "@grexie/pages/api/Handler";
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
        import __pages_handler_component from ${JSON.stringify(
          options.handler
        )};
        ${hmrHeader}
      `;

      const footer = `
        const __pages_handler = __pages_wrap_handler(
          resource,
          __pages_handler_component,
          ${composablesRequires
            .map((_, i) => `__pages_create_composable(__pages_composable_${i})`)
            .join(',\n')}
        );

        __pages_hydrate(resource, __pages_handler);

        export default __pages_handler;

        ${hmrFooter}
      `;

      const compiled = await transformAsync(serializedResource.code, {
        presets: [[babelEnvPreset, { modules: false }]],
        plugins: [reactRefreshPlugin],
        inputSourceMap: serializedResource.map,
        sourceMaps: this.sourceMap,
      });

      return callback(
        null,
        header + compiled!.code + footer,
        compiled!.map
          ? (offsetLines(
              compiled!.map as any,
              header.split(/\r\n|\n/g).length
            ) as any)
          : undefined
      );
    } else {
      const compiled = await transformAsync(content.toString(), {
        presets: [[babelEnvPreset, { modules: false }]],
        plugins: [handlerModulePlugin, reactRefreshPlugin],
        inputSourceMap: inputSourceMap,
        sourceMaps: this.sourceMap,
      });

      // await context.modules.evict(factory, `${this.resourcePath}$original`, {
      //   recompile: true,
      // });

      resolver.resolve();

      const header = `
      import { wrapHandler as __pages_wrap_handler, hydrate as __pages_hydrate } from "@grexie/pages/api/Handler";
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

        ${hmrHeader}
      `;

      const footer = `
      ${serializedResource.code};
      const __pages_handler = __pages_wrap_handler(
        resource,
        __pages_handler_component,
        ${composablesRequires
          .map((_, i) => `__pages_create_composable(__pages_composable_${i})`)
          .join(',\n')}
      );

      __pages_hydrate(resource, __pages_handler);

      export default __pages_handler;

      ${hmrFooter}
    `;

      return callback(
        null,
        header + compiled!.code! + footer,
        compiled!.map
          ? (offsetLines(
              compiled!.map as any,
              header.split(/\r\n|\n/g).length
            ) as any)
          : undefined
      );
    }
  } catch (err) {
    console.error(err);
    resolver.reject(err);
    return callback(err as any);
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
