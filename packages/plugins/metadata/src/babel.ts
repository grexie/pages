import type * as BabelCoreNamespace from '@babel/core';
import type * as BabelTypesNamespace from '@babel/types';
import type { PluginObj } from '@babel/core';
import path from 'path';
import { wrapMetadata } from '@grexie/pages-runtime-metadata';
import yaml from 'yaml';
import { readFileSync } from 'fs';
import generator from '@babel/generator';
import { createRequire } from 'module';
import grayMatter from 'gray-matter';

const require = createRequire(import.meta.url);

export type Babel = typeof BabelCoreNamespace;
export type BabelTypes = typeof BabelTypesNamespace;

const extensions = [
  'yml',
  'yaml',
  'json',
  'js',
  'jsx',
  'cjs',
  'cjsx',
  'mjs',
  'mjsx',
  'ts',
  'tsx',
  'cts',
  'ctsx',
  'mts',
  'mtsx',
];

const BabelPagesPlugin = (babel: Babel): PluginObj => {
  return {
    visitor: {
      Program: {
        enter(_, state) {
          if (process.env.PAGES_DEBUG_TRANSFORM === 'true') {
            console.info('- pages', 'transforming', state.filename);
          }
          state.set('metadata', {
            type: 'ObjectExpression',
            properties: [],
          });
        },
        exit(p, state) {
          if (!state.get('pageConfig')?.transform) {
            return;
          }

          state.get('mangleComponentName')?.();

          const layouts = (state.get('pageConfig')?.layout ?? []).map(
            (layout: string, i: number) =>
              ({
                type: 'ImportDeclaration',
                source: { type: 'StringLiteral', value: layout },
                specifiers: [
                  {
                    type: 'ImportDefaultSpecifier',
                    local: {
                      type: 'Identifier',
                      name: `__pages_layout_${i}`,
                    },
                  },
                ],
              } as any)
          );

          const styles = Object.entries(
            (state.get('pageConfig')?.styles ?? {}) as Record<string, string>
          ).map(
            ([name, style]: [string, string]) =>
              ({
                type: 'ImportDeclaration',
                source: { type: 'StringLiteral', value: style },
                specifiers: [
                  {
                    type: 'ImportDefaultSpecifier',
                    local: {
                      type: 'Identifier',
                      name,
                    },
                  },
                ],
              } as any)
          );

          const metadata = {
            type: 'CallExpression',
            optional: false,
            callee: {
              type: 'CallExpression',
              optional: false,
              callee: {
                type: 'Identifier',
                name: '__pages_wrap_metadata',
              },
              arguments: [state.get('metadata')],
            },
            arguments: [
              { type: 'ObjectExpression', properties: [] },
              (state.get('files') as string[]).reduce(
                (node, _, i) =>
                  ({
                    type: 'CallExpression',
                    callee: {
                      type: 'Identifier',
                      name: `__pages_metadata_${i}`,
                    },
                    arguments: [
                      {
                        type: 'ObjectExpression',
                        properties: [],
                      },
                      node ?? {
                        type: 'Identifier',
                        name: 'undefined',
                      },
                    ],
                  } as any),
                null
              ) ?? { type: 'Identifier', name: 'undefined' },
            ],
          };

          const resourcePath = path
            .relative((state.opts as any).pagesDir, state.filename!)
            .split(new RegExp(path.sep, 'g'));

          resourcePath[resourcePath.length - 1] = resourcePath[
            resourcePath.length - 1
          ].replace(/\.\w+$/i, '');

          if (resourcePath[resourcePath.length - 1] === 'index') {
            resourcePath.pop();
          }

          const resource = {
            type: 'ObjectExpression',
            properties: [
              {
                type: 'ObjectProperty',
                method: false,
                shorthand: false,
                computed: false,
                key: {
                  type: 'Identifier',
                  name: 'path',
                },
                value: {
                  type: 'ArrayExpression',
                  elements: resourcePath.map(name => ({
                    type: 'StringLiteral',
                    value: name,
                  })),
                },
              },
              {
                type: 'ObjectProperty',
                method: false,
                shorthand: false,
                computed: false,
                key: {
                  type: 'Identifier',
                  name: 'slug',
                },
                value: {
                  type: 'StringLiteral',
                  value: '/' + [...resourcePath, ''].join('/'),
                },
              },
              {
                type: 'ObjectProperty',
                method: false,
                shorthand: false,
                computed: false,
                key: {
                  type: 'Identifier',
                  name: 'metadata',
                },
                value: metadata,
              },
            ],
          };

          const withOnce = (node: any) => {
            if (!state.get('pageConfig')?.once) {
              return node;
            }

            return {
              type: 'CallExpression',
              callee: { type: 'Identifier', name: '__pages_with_once' },
              arguments: [node],
            };
          };

          const withPagesContext = (node: any) => {
            const pagesFiles = state.get('files') as string[];

            const pagesContext = babel.types.arrowFunctionExpression(
              [],
              babel.types.objectExpression([
                ...((state.opts as any).isServer
                  ? [
                      babel.types.objectProperty(
                        babel.types.identifier('resources'),
                        babel.types.valueToNode(
                          Object.values(
                            (state.opts as any).plugin.resources ?? {}
                          )
                        )
                      ),
                    ]
                  : []),
                babel.types.objectProperty(
                  babel.types.identifier('filename'),
                  babel.types.memberExpression(
                    babel.types.memberExpression(
                      babel.types.identifier('import'),
                      babel.types.identifier('meta')
                    ),
                    babel.types.identifier('url')
                  )
                ),
                babel.types.objectProperty(
                  babel.types.identifier('variables'),
                  babel.types.memberExpression(
                    babel.types.callExpression(
                      babel.types.identifier('__pages_use_metadata'),
                      [babel.types.valueToNode({ resource: true })]
                    ),
                    babel.types.identifier('variables')
                  )
                ),
                babel.types.objectProperty(
                  babel.types.identifier('typeDefs'),
                  babel.types.callExpression(
                    babel.types.memberExpression(
                      babel.types.arrayExpression(
                        pagesFiles.map((_, i) =>
                          babel.types.identifier(`__pages_typeDefs_${i}`)
                        )
                      ),
                      babel.types.identifier('reduce')
                    ),
                    [
                      babel.types.arrowFunctionExpression(
                        [
                          babel.types.identifier('a'),
                          babel.types.identifier('b'),
                        ],
                        babel.types.arrayExpression([
                          babel.types.spreadElement(
                            babel.types.identifier('a')
                          ),
                          babel.types.spreadElement(
                            babel.types.logicalExpression(
                              '??',
                              babel.types.identifier('b'),
                              babel.types.arrayExpression()
                            )
                          ),
                        ])
                      ),
                      babel.types.arrayExpression(),
                    ]
                  )
                ),
                babel.types.objectProperty(
                  babel.types.identifier('resolvers'),
                  babel.types.callExpression(
                    babel.types.memberExpression(
                      babel.types.arrayExpression(
                        pagesFiles.map((_, i) =>
                          babel.types.identifier(`__pages_resolvers_${i}`)
                        )
                      ),
                      babel.types.identifier('reduce')
                    ),
                    [
                      babel.types.arrowFunctionExpression(
                        [
                          babel.types.identifier('a'),
                          babel.types.identifier('b'),
                        ],
                        babel.types.arrayExpression([
                          babel.types.spreadElement(
                            babel.types.identifier('a')
                          ),
                          babel.types.spreadElement(
                            babel.types.logicalExpression(
                              '??',
                              babel.types.identifier('b'),
                              babel.types.arrayExpression()
                            )
                          ),
                        ])
                      ),
                      babel.types.arrayExpression(),
                    ]
                  )
                ),
              ])
            );

            return babel.types.callExpression(
              babel.types.callExpression(
                babel.types.identifier('__pages_with_pages_context'),
                [pagesContext]
              ),
              [node]
            );
          };

          const layoutLength = state.get('pageConfig')?.layout?.length ?? 0;

          const imports: any = [
            ...(state.get('pageConfig')?.once
              ? [
                  {
                    type: 'ImportDeclaration',
                    source: {
                      type: 'StringLiteral',
                      value: '@grexie/pages',
                    },
                    specifiers: [
                      {
                        type: 'ImportSpecifier',
                        imported: { type: 'Identifier', name: 'withOnce' },
                        local: {
                          type: 'Identifier',
                          name: '__pages_with_once',
                        },
                      },
                    ],
                  },
                ]
              : []),
            {
              type: 'ImportDeclaration',
              source: {
                type: 'StringLiteral',
                value: 'react/jsx-runtime',
              },
              specifiers: [
                {
                  type: 'ImportSpecifier',
                  imported: { type: 'Identifier', name: 'jsx' },
                  local: { type: 'Identifier', name: '__pages_jsx' },
                },
              ],
            },
            {
              type: 'ImportDeclaration',
              source: {
                type: 'StringLiteral',
                value: '@grexie/pages',
              },
              specifiers: [
                {
                  type: 'ImportSpecifier',
                  imported: { type: 'Identifier', name: 'wrapDocument' },
                  local: {
                    type: 'Identifier',
                    name: '__pages_wrap_document',
                  },
                },
                {
                  type: 'ImportSpecifier',
                  imported: { type: 'Identifier', name: 'wrapResource' },
                  local: {
                    type: 'Identifier',
                    name: '__pages_wrap_resource',
                  },
                },
              ],
            },
            ...layouts,
            ...styles,
            {
              type: 'ImportDeclaration',
              source: {
                type: 'StringLiteral',
                value: '@grexie/pages-runtime-metadata',
              },
              specifiers: [
                {
                  type: 'ImportSpecifier',
                  imported: { type: 'Identifier', name: 'wrapMetadata' },
                  local: {
                    type: 'Identifier',
                    name: '__pages_wrap_metadata',
                  },
                },
              ],
            },
            babel.types.importDeclaration(
              [
                babel.types.importSpecifier(
                  babel.types.identifier('__pages_with_pages_context'),
                  babel.types.identifier('withPagesContext')
                ),
                babel.types.importSpecifier(
                  babel.types.identifier('__pages_use_metadata'),
                  babel.types.identifier('useMetadata')
                ),
              ],
              babel.types.stringLiteral('@grexie/pages')
            ),
            ...(state.get('files') as string[]).map(
              (file, i) =>
                ({
                  type: 'ImportDeclaration',
                  source: { type: 'StringLiteral', value: file },
                  specifiers: [
                    {
                      type: 'ImportDefaultSpecifier',
                      local: {
                        type: 'Identifier',
                        name: `__pages_metadata_${i}`,
                      },
                    },
                    babel.types.importSpecifier(
                      babel.types.identifier(`__pages_typeDefs_${i}`),
                      babel.types.identifier('typeDefs')
                    ),
                    babel.types.importSpecifier(
                      babel.types.identifier(`__pages_resolvers_${i}`),
                      babel.types.identifier('resolvers')
                    ),
                  ],
                } as any)
            ),
            {
              type: 'ExportNamedDeclaration',
              specifiers: [],
              declaration: {
                type: 'VariableDeclaration',
                kind: 'const',
                declarations: [
                  {
                    type: 'VariableDeclarator',
                    id: { type: 'Identifier', name: 'resource' },
                    init: resource,
                  },
                ],
              },
            },
          ];

          const exports: any = [
            babel.types.variableDeclaration('const', [
              babel.types.variableDeclarator(
                babel.types.identifier('__pages_wrapped_resource'),
                babel.types.callExpression(
                  babel.types.identifier('__pages_wrap_resource'),
                  [
                    withOnce(
                      withPagesContext(
                        babel.types.functionExpression(
                          babel.types.identifier('__pages_component_wrapper'),
                          [babel.types.identifier('props')],
                          babel.types.blockStatement([
                            babel.types.ifStatement(
                              babel.types.callExpression(
                                babel.types.memberExpression(
                                  babel.types.arrayExpression(
                                    Object.keys(
                                      state.get('pageConfig')?.styles ?? {}
                                    ).map(name =>
                                      babel.types.callExpression(
                                        babel.types.memberExpression(
                                          babel.types.identifier(name),
                                          babel.types.identifier('use')
                                        ),
                                        []
                                      )
                                    )
                                  ),
                                  babel.types.identifier('reduce')
                                ),
                                [
                                  babel.types.arrowFunctionExpression(
                                    [
                                      babel.types.identifier('a'),
                                      babel.types.identifier('b'),
                                    ],
                                    babel.types.logicalExpression(
                                      '||',
                                      babel.types.identifier('a'),
                                      babel.types.identifier('b')
                                    )
                                  ),
                                  babel.types.identifier('false'),
                                ]
                              ),
                              babel.types.expressionStatement(
                                babel.types.nullLiteral()
                              )
                            ),
                            babel.types.returnStatement(
                              babel.types.memberExpression(
                                babel.types.identifier('props'),
                                babel.types.identifier('children')
                              )
                            ),
                          ])
                        )
                      )
                    ),
                    babel.types.identifier('resource'),
                  ]
                )
              ),
            ]),
            {
              type: 'ExportDefaultDeclaration',
              specifiers: [],
              declaration: {
                type: 'CallExpression',
                callee: {
                  type: 'Identifier',
                  name: '__pages_wrap_document',
                },
                arguments: [
                  {
                    type: 'FunctionDeclaration',
                    id: { type: 'Identifier', name: 'Page' },
                    params: [{ type: 'Identifier', name: 'props' }],
                    body: {
                      type: 'BlockStatement',
                      body: [
                        {
                          type: 'ReturnStatement',
                          argument: (
                            (state.get('pageConfig')?.layout ?? []) as string[]
                          )
                            .slice()
                            .reverse()
                            .reduce(
                              (node, _, i) => ({
                                type: 'CallExpression',
                                callee: {
                                  type: 'Identifier',
                                  name: '__pages_jsx',
                                },
                                arguments: [
                                  {
                                    type: 'Identifier',
                                    name: `__pages_layout_${
                                      layoutLength - i - 1
                                    }`,
                                  },
                                  {
                                    type: 'ObjectExpression',
                                    properties: [
                                      {
                                        type: 'ObjectProperty',
                                        method: false,
                                        shorthand: false,
                                        computed: false,
                                        key: {
                                          type: 'Identifier',
                                          name: 'children',
                                        },
                                        value: node,
                                      },
                                    ],
                                  },
                                ],
                              }),
                              {
                                type: 'CallExpression',
                                callee: {
                                  type: 'Identifier',
                                  name: '__pages_jsx',
                                },
                                arguments: [
                                  {
                                    type: 'Identifier',
                                    name: `__pages_wrapped_resource`,
                                  },
                                  {
                                    type: 'ObjectExpression',
                                    properties: [
                                      {
                                        type: 'ObjectProperty',
                                        method: false,
                                        shorthand: false,
                                        computed: false,
                                        key: {
                                          type: 'Identifier',
                                          name: 'children',
                                        },
                                        value: {
                                          type: 'CallExpression',
                                          callee: {
                                            type: 'Identifier',
                                            name: '__pages_jsx',
                                          },
                                          arguments: [
                                            {
                                              type: 'Identifier',
                                              name: '__pages_component',
                                            },
                                            {
                                              type: 'Identifier',
                                              name: 'props',
                                            },
                                          ],
                                        },
                                      },
                                    ],
                                  },
                                ],
                              } as any
                            ),
                        },
                      ],
                    },
                  },
                  { type: 'Identifier', name: 'resource' },
                ],
              },
            },
          ];

          if (state.get('pageConfig')?.queries) {
            imports.push(
              babel.types.importDeclaration(
                [
                  babel.types.importSpecifier(
                    babel.types.identifier('__pages_query'),
                    babel.types.identifier('pages')
                  ),
                ],
                babel.types.stringLiteral('@grexie/pages')
              ),
              ...Object.entries(
                (state.get('pageConfig')?.queries ?? {}) as Record<
                  string,
                  string
                >
              )?.map(([name, query]) =>
                babel.types.variableDeclaration('const', [
                  babel.types.variableDeclarator(
                    babel.types.identifier(name),
                    babel.types.arrowFunctionExpression(
                      [],
                      babel.types.taggedTemplateExpression(
                        babel.types.identifier('__pages_query'),
                        babel.types.templateLiteral(
                          [babel.types.templateElement({ raw: query })],
                          []
                        )
                      )
                    )
                  ),
                ])
              )
            );
          }

          p.unshiftContainer('body', imports);
          p.pushContainer('body', exports);

          // const querySymbols: string[] = [];

          // // SWC fix
          // p.traverse({
          //   ImportDeclaration(p) {
          //     if (p.get('source').isStringLiteral({ value: '@grexie/pages' })) {
          //       const specifier = p
          //         .get('specifiers')
          //         .find(p =>
          //           (p.get('imported') as any).isIdentifier({ name: 'pages' })
          //         );
          //       if (specifier) {
          //         querySymbols.push(specifier.node.local.name);
          //       }
          //     }
          //   },
          //   CallExpression(p2) {
          //     if (querySymbols.includes((p2.get('callee').node as any).name)) {
          //       let query: string | undefined;

          //       p2.traverse({
          //         ArrayExpression(p5) {
          //           query = p5.node.elements
          //             .map(
          //               literal =>
          //                 (literal as BabelTypesNamespace.StringLiteral).value
          //             )
          //             .join('');
          //         },
          //         CallExpression(p3) {
          //           const name = (p3.get('callee').node as any).name;
          //           p.traverse({
          //             FunctionDeclaration(p4) {
          //               if (!p4.get('id').isIdentifier({ name: name })) {
          //                 return p4.skip();
          //               }

          //               p4.traverse({
          //                 ArrayExpression(p5) {
          //                   query = p5.node.elements
          //                     .map(
          //                       literal =>
          //                         (literal as BabelTypesNamespace.StringLiteral)
          //                           .value
          //                     )
          //                     .join('');
          //                   p4.remove();
          //                 },
          //               });
          //             },
          //           });
          //         },
          //       });

          //       if (query) {
          //         p2.replaceWith(
          //           babel.types.taggedTemplateExpression(
          //             babel.types.identifier(querySymbols[0]),
          //             babel.types.templateLiteral(
          //               [babel.types.templateElement({ raw: query })],
          //               []
          //             )
          //           )
          //         );
          //       }
          //     }
          //   },
          // });

          // querySymbols.splice(0, querySymbols.length);

          // let pagesIndex = 0;
          // p.traverse({
          //   ImportDeclaration(p) {
          //     if (p.get('source').isStringLiteral({ value: '@grexie/pages' })) {
          //       const specifier = p
          //         .get('specifiers')
          //         .find(p =>
          //           (p.get('imported') as any).isIdentifier({ name: 'pages' })
          //         );
          //       if (specifier) {
          //         querySymbols.push(specifier.node.local.name);
          //         // specifier.remove();
          //       }
          //     }
          //   },
          //   TaggedTemplateExpression(p2) {
          //     if (querySymbols.includes((p2.node.tag as any).name)) {
          //       const query = p2.node.quasi.quasis
          //         .map(x => x.value.raw)
          //         .join('');

          //       // p.unshiftContainer('body', [
          //       //   babel.types.importDeclaration(
          //       //     [
          //       //       babel.types.importDefaultSpecifier(
          //       //         babel.types.identifier(`__pages_query_${pagesIndex}`)
          //       //       ),
          //       //     ],
          //       //     babel.types.stringLiteral(
          //       //       `@grexie/pages-loader/lib/query.mjs?query=${encodeURIComponent(
          //       //         Buffer.from(query).toString('base64url')
          //       //       )}&resource=${encodeURIComponent(
          //       //         Buffer.from(
          //       //           JSON.stringify({
          //       //             path: resourcePath,
          //       //             slug: '/' + [...resourcePath, ''].join('/'),
          //       //             metadata: {
          //       //               ...state.get('metadataJson'),
          //       //             },
          //       //           })
          //       //         ).toString('base64url')
          //       //       )}&filename=${encodeURIComponent(
          //       //         Buffer.from(state.filename!).toString('base64url')
          //       //       )}`
          //       //     )
          //       //   ),
          //       // ]);

          //       // p2.replaceWith(
          //       //   babel.types.callExpression(
          //       //     babel.types.identifier(`__pages_query`),
          //       //     []
          //       //   )
          //       // );

          //       pagesIndex++;
          //     }
          //   },
          // });
        },
      },
      ExportNamedDeclaration(p, state) {
        if (
          p.get('declaration').isVariableDeclaration({ kind: 'const' }) &&
          (p
            .get('declaration')
            .get('declarations')
            .find((p: any) =>
              p.get('id').isIdentifier({ name: 'getStaticProps' })
            ) ||
            p
              .get('declaration')
              .get('declarations')
              .find((p: any) =>
                p.get('id').isIdentifier({ name: 'getServerSideProps' })
              ))
        ) {
          // NOOP
        } else if (
          p.get('declaration').isVariableDeclaration({ kind: 'const' })
        ) {
          const p2: BabelCoreNamespace.NodePath<BabelTypesNamespace.VariableDeclarator> =
            p
              .get('declaration')
              .get('declarations')
              .find((p2: any) =>
                p2.get('id').isIdentifier({ name: 'metadata' })
              ) as any;

          if (!p2) {
            return p.skip();
          }

          const resourcePath = path
            .relative((state.opts as any).pagesDir, state.filename!)
            .split(new RegExp(path.sep, 'g'));

          resourcePath[resourcePath.length - 1] = resourcePath[
            resourcePath.length - 1
          ].replace(/\.\w+$/i, '');

          if (resourcePath[resourcePath.length - 1] === 'index') {
            resourcePath.pop();
          }

          (
            p2.get(
              'init'
            ) as BabelCoreNamespace.NodePath<BabelTypesNamespace.ObjectExpression>
          ).unshiftContainer('properties', [
            babel.types.objectProperty(
              babel.types.identifier('path'),
              babel.types.valueToNode(resourcePath)
            ),
            babel.types.objectProperty(
              babel.types.identifier('slug'),
              babel.types.valueToNode('/' + [...resourcePath].join('/'))
            ),
          ]);

          state.set('metadata', p2.get('init').node);

          state.set(
            'files',
            (state.opts as any).plugin.getPagesFiles(state.filename!)
          );

          let data: any;

          if (/\.mdx?$/.test(state.filename!)) {
            const content = readFileSync(state.filename!);
            const { data: d } = grayMatter(content);
            data = d;
          } else {
            data = new Function(
              `return (${generator.default(state.get('metadata')).code})`
            )();
          }

          p2.get('init')
            .get('properties')
            .find(((p: any) => {
              if (p.get('key').isIdentifier({ name: 'page' })) {
                p.remove();
              }
            }) as any);

          const metadata = wrapMetadata(data)(
            { filename: state.filename! },
            (state.get('files') as string[]).reduce((a, b) => {
              const extension = path.extname(b);
              let data: any;
              if ((state.opts as any).plugin.cache[b]) {
                return (state.opts as any).plugin.cache[b];
              } else if (/\.ya?ml$/.test(extension)) {
                data = yaml.parse(readFileSync(b).toString());
              } else if (/\.json$/.test(extension)) {
                data = JSON.parse(readFileSync(b).toString());
              } else if (/\.[cm]?[jt]s?$/.test(extension)) {
                const result = babel.parseSync(readFileSync(b).toString(), {
                  filename: b,
                  presets: [['@babel/env', { modules: false }]],
                  plugins: [
                    '@babel/syntax-jsx',
                    ['@babel/syntax-typescript', { isTSX: true }],
                  ],
                });

                babel.traverse(result!, {
                  ExportDefaultDeclaration(p) {
                    data = new Function(
                      `return (${
                        generator.default(p.get('declaration').node as any).code
                      })`
                    )();
                  },
                });
              } else {
                throw new Error('invalid pages file: ' + b);
              }

              const metadata = wrapMetadata(data)({ filename: b }, a);
              (state.opts as any).plugin.cache[b] = metadata;
              return metadata;
            }, undefined as any)
          );

          state.set('metadataJson', JSON.parse(JSON.stringify(metadata)));

          state.set('pageConfig', metadata.page);

          if (state.get('pageConfig')?.transform) {
            p2.remove();
          }

          if (process.env.PAGES_DEBUG_TRANSFORM === 'true') {
            console.info('- pages', 'transformed', state.filename);
          }
        }
      },
      ExportDefaultDeclaration(p, state) {
        state.set('component', p.get('declaration'));
        state.set('mangleComponentName', () => {
          const component: any = p.get('declaration').node;

          p.replaceWith({
            type: 'VariableDeclaration',
            kind: 'const',
            declarations: [
              {
                type: 'VariableDeclarator',
                id: { type: 'Identifier', name: '__pages_component' },
                init: component,
              },
            ],
          });
        });
      },
    },
  };
};

export default BabelPagesPlugin;
