import { LoaderContext } from 'webpack';
import babel, { transformAsync, PluginObj, PluginPass } from '@babel/core';

export default async function MetadataLoader(
  this: LoaderContext<void>,
  content: Buffer,
  inputSourceMap: any
) {
  if (process.env.PAGES_DEBUG_LOADERS === 'true') {
    console.debug('metadata-loader', this.resourcePath);
  }
  const callback = this.async();

  try {
    const compiled = await transformAsync(content.toString(), {
      presets: [['@babel/env', { modules: false }]],
      plugins: [
        '@babel/syntax-jsx',
        ['@babel/syntax-typescript', { isTSX: true }],
        configModulePlugin,
      ],
      filename: this.resourcePath,
      sourceFileName: this.resourcePath,
      inputSourceMap: inputSourceMap,
      sourceMaps: !!this.sourceMap,
    });

    callback(null, compiled?.code ?? '', compiled!.map!);
  } catch (err) {
    console.error(err);
    callback(err as any);
  } finally {
    if (process.env.PAGES_DEBUG_LOADERS === 'true') {
      console.debug('metadata-loader:complete', this.resourcePath);
    }
  }
}

const configModulePlugin: (b: typeof babel) => PluginObj<PluginPass> = ({
  types: t,
}) => {
  return {
    visitor: {
      ExportNamedDeclaration: {
        enter(p, state) {
          if (
            p.get('declaration').isVariableDeclaration() &&
            p
              .get('declaration')
              .get('declarations')
              .find((p: any) => p.get('id').isIdentifier({ name: 'typeDefs' }))
              ?.isVariableDeclarator()
          ) {
            state.set('hasTypeDefs', true);
          }

          if (
            p.get('declaration').isVariableDeclaration() &&
            p
              .get('declaration')
              .get('declarations')
              .find((p: any) => p.get('id').isIdentifier({ name: 'resolvers' }))
              ?.isVariableDeclarator()
          ) {
            state.set('hasResolvers', true);
          }
        },
      },
      ExportDefaultDeclaration: {
        enter: path => {
          path.insertBefore(
            t.importDeclaration(
              [
                t.importSpecifier(
                  t.identifier('__pages_wrap_metadata'),
                  t.identifier('wrapMetadata')
                ),
              ],
              t.stringLiteral('@grexie/pages-runtime-metadata')
            )
          );
          path.insertBefore(
            t.variableDeclaration('const', [
              t.variableDeclarator(
                t.identifier('__pages_metadata'),
                path.node.declaration as any
              ),
            ])
          );
          path.remove();
        },
      },
      Program: {
        exit(path, state) {
          if (!state.get('hasTypeDefs')) {
            path.unshiftContainer('body', [
              t.exportNamedDeclaration(
                t.variableDeclaration('const', [
                  t.variableDeclarator(
                    t.identifier('typeDefs'),
                    t.arrayExpression()
                  ),
                ])
              ),
            ]);
          }
          if (!state.get('hasResolvers')) {
            path.unshiftContainer('body', [
              t.exportNamedDeclaration(
                t.variableDeclaration('const', [
                  t.variableDeclarator(
                    t.identifier('resolvers'),
                    t.arrayExpression()
                  ),
                ])
              ),
            ]);
          }
          path.node.body.push(
            t.exportDefaultDeclaration(
              t.callExpression(t.identifier('__pages_wrap_metadata'), [
                t.identifier('__pages_metadata'),
              ])
            )
          );
        },
      },
    },
  };
};
