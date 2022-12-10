import { LoaderContext } from 'webpack';
import type { BuildContext } from '@grexie/pages-builder';
import path from 'path';
import babel, { transformAsync, PluginObj, PluginPass } from '@babel/core';

interface PagesLoaderOptions {
  context: BuildContext;
}

export default async function PagesLoader(
  this: LoaderContext<PagesLoaderOptions>,
  content: Buffer,
  inputSourceMap: any
) {
  if (process.env.PAGES_DEBUG_LOADERS === 'true') {
    console.debug('config-loader', this.resourcePath);
  }
  const callback = this.async();

  this.cacheable(false);

  try {
    const compiled = await transformAsync(content.toString(), {
      plugins: [configModulePlugin],
      filename: this.resourcePath,
      sourceFileName: this.resourcePath,
      inputSourceMap: inputSourceMap,
      sourceMaps: !!this.sourceMap,
    });

    callback(null, compiled!.code!, compiled!.map ?? inputSourceMap);
  } catch (err) {
    console.error(err);
    callback(err as any);
  } finally {
    if (process.env.PAGES_DEBUG_LOADERS === 'true') {
      console.debug('config-loader:complete', this.resourcePath);
    }
  }
}

const configModulePlugin: (b: typeof babel) => PluginObj<PluginPass> = ({
  types: t,
}) => ({
  visitor: {
    ExportDefaultDeclaration: {
      enter: path => {
        path.insertBefore(
          t.importDeclaration(
            [
              t.importSpecifier(
                t.identifier('__pages_wrap_config'),
                t.identifier('wrapConfig')
              ),
            ],
            t.stringLiteral('@grexie/pages-runtime-config')
          )
        );
        path.insertBefore(
          t.variableDeclaration('const', [
            t.variableDeclarator(
              t.identifier('__pages_config'),
              path.node.declaration as any
            ),
          ])
        );
        path.remove();
      },
    },
    Program: {
      exit(path) {
        path.node.body.push(
          t.exportDefaultDeclaration(
            t.callExpression(t.identifier('__pages_wrap_config'), [
              t.identifier('__pages_config'),
            ])
          )
        );
      },
    },
  },
});
