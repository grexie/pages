import type * as BabelCoreNamespace from '@babel/core';
import type * as BabelTypesNamespace from '@babel/types';
import type { PluginObj } from '@babel/core';
import path from 'path';
import { wrapMetadata } from '@grexie/pages-runtime-metadata';
import glob from 'glob';
import yaml from 'yaml';
import { readFileSync } from 'fs';
import generator from '@babel/generator';

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
            .split(path.delimiter);

          resourcePath[resourcePath.length - 1] = resourcePath[
            resourcePath.length - 1
          ].replace(/\.\w+$/i, '');

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
                  value: ['', ...resourcePath].join('/'),
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
                  ],
                } as any)
            ),
          ];
          const exports: any = [
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
            {
              type: 'VariableDeclaration',
              kind: 'const',
              declarations: [
                {
                  type: 'VariableDeclarator',
                  id: {
                    type: 'Identifier',
                    name: '__pages_wrapped_resource',
                  },
                  init: {
                    type: 'CallExpression',
                    callee: {
                      type: 'Identifier',
                      name: '__pages_wrap_resource',
                    },
                    arguments: [
                      withOnce({
                        type: 'FunctionDeclaration',
                        id: {
                          type: 'Identifier',
                          name: '__pages_component_wrapper',
                        },
                        params: [{ type: 'Identifier', name: 'props' }],
                        body: {
                          type: 'BlockStatement',
                          body: [
                            ...Object.keys(
                              state.get('pageConfig')?.styles ?? {}
                            ).map(name => ({
                              type: 'ExpressionStatement',
                              expression: {
                                type: 'CallExpression',
                                callee: {
                                  type: 'MemberExpression',
                                  object: { type: 'Identifier', name },
                                  property: {
                                    type: 'Identifier',
                                    name: 'use',
                                  },
                                },
                                arguments: [],
                              },
                            })),
                            {
                              type: 'ReturnStatement',
                              argument: {
                                type: 'MemberExpression',
                                object: {
                                  type: 'Identifier',
                                  name: 'props',
                                },
                                property: {
                                  type: 'Identifier',
                                  name: 'children',
                                },
                              },
                            },
                          ],
                        },
                      }),
                      { type: 'Identifier', name: 'resource' },
                    ],
                  },
                },
              ],
            },
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

          p.unshiftContainer('body', imports);

          // console.info(generator.default(p.node).code);
          p.pushContainer('body', exports);
        },
      },
      ExportNamedDeclaration(p, state) {
        if (p.get('declaration').isVariableDeclaration({ kind: 'const' })) {
          p.traverse({
            VariableDeclarator(p) {
              if (p.get('id').isIdentifier({ name: 'metadata' })) {
                p.get('init').traverse({
                  ObjectProperty(p2) {
                    if (
                      p2.parentPath.node === p.get('init').node &&
                      p2.get('key').isIdentifier({ name: 'page' })
                    ) {
                      p2.remove();
                    }
                  },
                });

                state.set('metadata', p.get('init').node);

                state.set(
                  'pagesFiles',
                  glob
                    .sync('**/*.pages.{' + extensions.join(',') + '}', {
                      cwd: process.cwd(),
                      ignore: ['**/node_modules/**', '**/.next/**'],
                      nodir: true,
                      dot: true,
                    })
                    .map(file => path.resolve(process.cwd(), file))
                );

                state.set(
                  'files',
                  (state.get('pagesFiles') as string[])
                    .slice()
                    .filter(filename => {
                      const basename = path
                        .basename(filename)
                        .replace(/\.pages\.\w+$/i, '');
                      const sourceBasename = path
                        .basename(state.filename!)
                        .replace(/\.\w+$/i, '');
                      const dirname = path.dirname(filename);

                      return (
                        (path
                          .dirname(state.filename!)
                          .substring(0, dirname.length) === dirname &&
                          basename === '') ||
                        (path.dirname(state.filename!) === dirname &&
                          basename === sourceBasename)
                      );
                    })
                );

                const data = new Function(
                  `return (${generator.default(state.get('metadata')).code})`
                )();

                state.set(
                  'pageConfig',
                  wrapMetadata(data)(
                    { filename: state.filename! },
                    (state.get('files') as string[]).reduce((a, b) => {
                      const data = yaml.parse(readFileSync(b).toString());
                      return wrapMetadata(data)({ filename: b }, a);
                    }, undefined as any)
                  ).page
                );

                if (state.get('pageConfig')?.transform) {
                  p.remove();
                }
              }
            },
          });

          // console.info('completing metadata export', p.node);
          // if (
          //   !(
          //     p.get('declaration')
          //       .node as BabelTypesNamespace.VariableDeclaration
          //   ).declarations.length
          // ) {
          //   p.remove();
          // }
          // console.info('completed metadata export');
        }
      },
      ExportDefaultDeclaration(p, state) {
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
