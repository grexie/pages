import type { LoaderContext } from 'webpack';
import type { BuildContext } from '@grexie/pages-builder';
import type { InstantiatedModule } from '@grexie/pages-builder';
import type { Handler } from '@grexie/pages-builder';
import type { Resource } from '@grexie/pages/api';
import _path from 'path';
import * as babel from '@babel/core';
import { PluginObj, PluginPass, transformAsync } from '@babel/core';
import babelEnvPreset from '@babel/preset-env';
import reactRefreshPlugin from 'react-refresh/babel';
import { offsetLines } from '@grexie/source-maps';
import { createComposable } from '@grexie/compose';

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
  this.cacheable(false);

  if (process.env.PAGES_DEBUG_LOADERS === 'true') {
    console.info('module-loader', this.resourcePath);
  }

  const { context, ...options } = this.getOptions();

  const modules = context.getModuleContext(this._compilation!);

  try {
    const path = context.builder.filenameToPath(this.resourcePath);

    const createHandler = async () => {
      let handlerModule: InstantiatedModule;
      if (typeof options.handler === 'string') {
        handlerModule = await modules.requireModule(
          _path.dirname(options.handler),
          options.handler
        );
      } else {
        handlerModule = await modules.createModule(
          _path.dirname(this.resourcePath),
          this.resourcePath,
          content.toString()
        );
      }
      return handlerModule;
    };

    let handlerModule = await createHandler();

    this.addDependency(
      options.handler ? handlerModule.filename : this.resourcePath
    );

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

    const sourceContext = context.createSourceContext({
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

      const layoutModule = await modules.requireModule(
        _path.dirname(this.resourcePath),
        layout
      );

      this.addDependency(layoutModule.filename);

      composables.push(createComposable(layoutModule.exports.default));
    }

    sourceContext.emit('end');

    const serializedResource = await sourceContext.serialize(resource);

    const hmrHeader = `
      import __pages_refresh_runtime from '@grexie/pages-runtime-hmr';

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
      if (typeof module === 'undefined') {
        __pages_refresh_runtime.update(import.meta.webpackHot);
      } else {
          __pages_refresh_runtime.update(module.hot);
      }
      __pages_refresh_global.$RefreshReg$ = __pages_previous_refreshreg;
      __pages_refresh_global.$RefreshSig$ = __pages_previous_refreshsig;
    `;

    if (options.handler) {
      const header = `
        import { wrapHandler as __pages_wrap_handler, hydrate as __pages_hydrate } from "@grexie/pages-runtime-handler";
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
        ${this.hot ? hmrHeader : ''}
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

        ${this.hot ? hmrFooter : ''}
      `;

      const requests: string[] = [];
      const compiled = await transformAsync(serializedResource.code, {
        presets: [[babelEnvPreset, { modules: false }]],
        plugins: [
          extractImportsPlugin(requests),
          ...(this.hot ? [reactRefreshPlugin] : []),
        ],
        inputSourceMap: await serializedResource.map,
        sourceMaps: this.sourceMap,
      });

      const references = await Promise.all(
        requests.map(async request =>
          modules.resolver.resolve(this.context, request)
        )
      );
      references
        .filter(({ builtin }) => !builtin)
        .forEach(({ filename }) => this.addDependency(filename));

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
      const requests: string[] = [];

      const compiled = await transformAsync(content.toString(), {
        presets: [[babelEnvPreset, { modules: false }]],
        plugins: [
          extractImportsPlugin(requests),
          handlerModulePlugin,
          ...(this.hot ? [reactRefreshPlugin] : []),
        ],
        inputSourceMap: inputSourceMap || false,
        sourceMaps: this.sourceMap,
      });

      const references = await Promise.all(
        requests.map(async request =>
          modules.resolver.resolve(this.context, request)
        )
      );
      references
        .filter(({ builtin }) => !builtin)
        .forEach(({ filename }) => this.addDependency(filename));

      const header = `
      import { wrapHandler as __pages_wrap_handler, hydrate as __pages_hydrate } from "@grexie/pages-runtime-handler";
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
    return callback(err as any);
  } finally {
    if (process.env.PAGES_DEBUG_LOADERS === 'true') {
      console.info('module-loader:complete', this.resourcePath);
    }
  }
}

const extractImportsPlugin: (
  requests: string[]
) => (b: typeof babel) => PluginObj<PluginPass> =
  requests =>
  ({ types: t }) => ({
    visitor: {
      CallExpression: (path: any) => {
        if (
          t.isIdentifier(path.node.callee, {
            name: 'require',
          })
        ) {
          const id = path.node.arguments[0];

          if (t.isStringLiteral(id)) {
            requests.push(id.value);
          }
        }
      },
      ImportDeclaration: (path: any) => {
        requests.push(path.node.source.value);
      },
      ExportAllDeclaration: (path: any) => {
        requests.push(path.node.source.value);
      },
      ExportNamedDeclaration: (path: any) => {
        if (path.node.source) {
          requests.push(path.node.source.value);
        }
      },
    },
  });

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
      if (path.node.source) {
      }
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
