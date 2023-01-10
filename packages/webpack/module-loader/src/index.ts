import type { Dependency, LoaderContext } from 'webpack';
import type { BuildContext, Builder, Renderer } from '@grexie/pages-builder';
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
import webpack from 'webpack';

interface ModuleLoaderOptions {
  context: BuildContext;
  handler?: string;
}

interface ComposableRequire {
  specifier: string;
  exportName: string;
}

export default async function ModuleLoader(
  this: LoaderContext<ModuleLoaderOptions>,
  content: Buffer,
  inputSourceMap: any
) {
  const callback = this.async();

  const { EventManager, EventPhase } = await import('@grexie/pages-builder');

  if (process.env.PAGES_DEBUG_LOADERS === 'true') {
    console.debug('module-loader', this.resourcePath);
  }

  let { context, ...options } = this.getOptions();

  const events = EventManager.get<Renderer>(context.renderer);

  const modules = context.getModuleContext(this._compilation!);

  try {
    let path = context.builder.filenameToPath(this.resourcePath);
    const source = await context.sources.getSource({ path });
    context = source.context;

    const createHandler = async () => {
      let handlerModule: InstantiatedModule;
      if (typeof options.handler === 'string') {
        handlerModule = await modules.requireModule(
          _path.dirname(this.resourcePath),
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

    if (options.handler) {
      this.addDependency(handlerModule.filename);
    }
    this.addDependency(this.resourcePath);

    const configModule = await context.config.create(this._compilation!, path);
    configModule.ancestors.forEach(({ module }) => {
      if (module) {
        this.addDependency(module.filename);
      }
    });

    const handler = handlerModule.exports as Handler;

    const configPromise = configModule.create(
      { metadata: {} },
      {
        pages: context,
        filename: this.resourcePath,
        dirname: _path.dirname(this.resourcePath),
      }
    );

    const config = await configPromise;

    let resource: Resource | undefined = undefined;

    let filename = _path.relative(context.root.rootDir, this.resourcePath);
    if (!filename.startsWith('../')) {
      filename = `./${filename}`;
    }

    const sourceContext = context.createSourceContext({
      compilation: this._compilation!,
      context,
      module: handlerModule,
      content,
      filename,
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

    const composablesRequires: ComposableRequire[] = [];

    const hookCollector =
      (requires: ComposableRequire[]) =>
      async (specifier: string, exportName: string = 'default') => {
        const module = await modules.resolver.resolve(
          _path.dirname(this.resourcePath),
          specifier
        );

        let relpath = _path.relative(
          _path.dirname(this.resourcePath),
          module.filename
        );

        if (!relpath.startsWith('../')) {
          relpath = './' + relpath;
        }

        requires.push({ specifier: relpath, exportName });

        this.addDependency(module.filename);
      };

    let layouts: string | string[] = sourceContext.config.layout ?? [];
    if (typeof layouts === 'string') {
      layouts = [layouts];
    }

    await Promise.all(
      layouts?.map(layout => hookCollector(composablesRequires)(layout))
    );

    const beforeRender: ComposableRequire[] = [];
    const beforeDocument: ComposableRequire[] = [];
    const afterDocument: ComposableRequire[] = [];
    const beforeLayout: ComposableRequire[] = [];
    const afterLayout: ComposableRequire[] = [];
    const afterRender: ComposableRequire[] = [];

    await events.emit(EventPhase.before, 'browser', {
      context: sourceContext,
      render: hookCollector(beforeRender),
      document: hookCollector(beforeDocument),
      layout: hookCollector(beforeLayout),
    });
    await events.emit(EventPhase.after, 'browser', {
      context: sourceContext,
      render: hookCollector(afterRender),
      document: hookCollector(afterDocument),
      layout: hookCollector(afterLayout),
    });

    composablesRequires.unshift(...beforeLayout);
    composablesRequires.push(...afterLayout);

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
      __pages_refresh_global.$RefreshReg$ = __pages_previous_refreshreg;
      __pages_refresh_global.$RefreshSig$ = __pages_previous_refreshsig;
    `;

    const renderComposableRequires = (
      basename: string,
      requires: ComposableRequire[]
    ) =>
      requires
        .map(({ specifier, exportName }, i) => {
          if (exportName === 'default') {
            return `import ${basename}${i} from ${JSON.stringify(specifier)};`;
          } else {
            return `import { ${exportName} as ${basename}${i} } from ${JSON.stringify(
              specifier
            )};`;
          }
        })
        .join('\n');

    const hooksImports = [
      renderComposableRequires('__pages_prerender_', beforeRender),
      renderComposableRequires('__pages_predocument_', beforeDocument),
      renderComposableRequires('__pages_postdocument_', afterDocument),
      renderComposableRequires('__pages_postrender_', afterRender),
      renderComposableRequires('__pages_layout_', composablesRequires),
    ].filter(x => !!x);

    if (hooksImports.length) {
      hooksImports.unshift(
        'import { createComposable as __pages_create_composable } from "@grexie/compose";'
      );
    }

    const renderComposables = (
      name: string,
      basename: string,
      requires: ComposableRequire[]
    ) =>
      `  ${name}:  [\n` +
      requires
        .map((_, i) => `    __pages_create_composable(${basename}${i})`)
        .join(',\n') +
      '\n  ]';

    const hooksFooter =
      'const __pages_hooks = {\n' +
      [
        renderComposables('beforeRender', '__pages_prerender_', beforeRender),
        renderComposables(
          'beforeDocument',
          '__pages_predocument_',
          beforeDocument
        ),
        renderComposables(
          'afterDocument',
          '__pages_postdocument_',
          afterDocument
        ),
        renderComposables('afterRender', '__pages_postrender_', afterRender),
      ].join(',\n') +
      '\n};';

    if (options.handler) {
      const header = `
        import { wrapHandler as __pages_wrap_handler, hydrate as __pages_hydrate } from "@grexie/pages-runtime-handler";
        ${hooksImports.join('\n')}
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
            .map((_, i) => `__pages_create_composable(__pages_layout_${i})`)
            .join(',\n')}
        );
        ${hooksFooter}
        ${
          this.hot
            ? "$RefreshReg$(__pages_handler, '%default%$__pages_handler');"
            : ''
        }
        ${
          config.render
            ? `const __pages_root = __pages_hydrate(resource, __pages_handler, __pages_hooks);`
            : ''
        }
        ${
          config.render && this.hot
            ? `if (__pages_root) { __pages_refresh_runtime.update(import.meta.webpackHot); }`
            : ''
        }

        
        export default __pages_handler;

        ${this.hot ? hmrFooter : ''}
      `;

      const requests: string[] = [];
      const compiled = await transformAsync(serializedResource.code, {
        presets: [[babelEnvPreset, { modules: false }]],
        plugins: [
          ...(this.hot ? [reactRefreshPlugin] : []),
          extractImportsPlugin(requests),
        ],
        inputSourceMap: await serializedResource.map,
        sourceMaps: !!this.sourceMap,
      });

      const references = await Promise.all(
        requests.map(async request =>
          modules.resolver.resolve(_path.dirname(this.resourcePath), request)
        )
      );
      references
        .filter(({ builtin }) => !builtin)
        .forEach(({ filename }) => this.addDependency(filename));

      callback(
        null,
        header + compiled!.code + footer,
        compiled!.map
          ? ((await offsetLines(
              compiled!.map as any,
              header.split(/\r\n|\n/g).length
            )) as any)
          : undefined
      );

      return;
    } else {
      const requests: string[] = [];

      const compiled = await transformAsync(content.toString(), {
        presets: [[babelEnvPreset, { modules: false }]],
        plugins: [
          ...(this.hot ? [reactRefreshPlugin] : []),
          extractImportsPlugin(requests),
          handlerModulePlugin,
        ],
        inputSourceMap: inputSourceMap || false,
        sourceMaps: !!this.sourceMap,
      });

      const references = await Promise.all(
        requests.map(async request =>
          modules.resolver.resolve(_path.dirname(this.resourcePath), request)
        )
      );
      references
        .filter(({ builtin }) => !builtin)
        .forEach(({ filename }) => this.addDependency(filename));

      const header = `
      import { wrapHandler as __pages_wrap_handler, hydrate as __pages_hydrate } from "@grexie/pages-runtime-handler";
      ${hooksImports.join('\n')}
      ${this.hot ? hmrHeader : ''}
      `;

      const footer = `
      ${serializedResource.code};
      ${
        handler.default
          ? `const __pages_handler = __pages_wrap_handler(
        resource,
        __pages_handler_component,
        ${composablesRequires
          .map((_, i) => `__pages_create_composable(__pages_layout_${i})`)
          .join(',\n')}
      );
      ${hooksFooter}
      ${
        this.hot
          ? "$RefreshReg$(__pages_handler, '%default%$__pages_handler');"
          : ''
      }
        ${
          config.render
            ? `const __pages_root = __pages_hydrate(resource, __pages_handler, __pages_hooks);`
            : ''
        }
        ${
          config.render && this.hot
            ? `if (__pages_root) { __pages_refresh_runtime.update(import.meta.webpackHot); }`
            : ''
        }

      

      export default __pages_handler;`
          : ''
      }
      ${this.hot ? hmrFooter : ''}
    `;

      callback(
        null,
        header + compiled!.code! + footer,
        compiled!.map
          ? ((await offsetLines(
              compiled!.map as any,
              header.split(/\r\n|\n/g).length
            )) as any)
          : undefined
      );
    }
  } catch (err) {
    const werr = new webpack.WebpackError(err as any);
    werr.stack = (err as Error).stack ?? werr.stack;
    callback(werr);
    return;
  } finally {
    if (process.env.PAGES_DEBUG_LOADERS === 'true') {
      console.debug('module-loader:complete', this.resourcePath);
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
