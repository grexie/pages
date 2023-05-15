import { name as isValidIdentifierName } from 'estree-util-is-identifier-name';
import { valueToEstree } from 'estree-util-value-to-estree';
import { load } from 'js-yaml';
import { Root, YAML } from 'mdast';
import { MdxjsEsm, mdxToMarkdown } from 'mdast-util-mdx';
import { toMarkdown } from 'mdast-util-to-markdown';
import { parse } from 'toml';
import { Plugin } from 'unified';
import { wrapMetadata } from '@grexie/pages-runtime-metadata';
import glob from 'glob';
import path from 'path';
import { createRequire } from 'module';
import yaml from 'yaml';
import { readFileSync } from 'fs';

export interface RemarkPagesOptions {
  /**
   * If specified, the YAML data is exported using this name. Otherwise, each
   * object key will be used as an export name.
   */
  name?: string;
}

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

/**
 * A remark plugin to expose frontmatter data as getStaticProps.
 *
 * @param options - Optional options to configure the output.
 * @returns A unified transformer.
 */
export const remarkPages: Plugin<[RemarkPagesOptions?]> =
  ({ name } = {}) =>
  (ast, file) => {
    const pagesFiles = glob
      .sync('**/*.pages.{' + extensions.join(',') + '}', {
        cwd: process.cwd(),
        ignore: ['**/node_modules/**', '**/.next/**'],
        nodir: true,
        dot: true,
      })
      .map(file => path.resolve(process.cwd(), file));

    const mdast = ast as Root;
    const imports: MdxjsEsm[] = [];

    if (name && !isValidIdentifierName(name)) {
      throw new Error(
        `If name is specified, this should be a valid identifier name, got: ${JSON.stringify(
          name
        )}`
      );
    }

    let data: any;

    for (const node of mdast.children) {
      const { value } = node as YAML;
      if (node.type === 'yaml') {
        data = load(value);
        break;
        // @ts-expect-error A custom node type may be registered for TOML frontmatter data.
      } else if (node.type === 'toml') {
        data = parse(value);
        break;
      }
    }

    data = data ?? {};

    const files = pagesFiles.slice().filter(filename => {
      const basename = path.basename(filename).replace(/\.pages\.\w+$/i, '');
      const sourceBasename = file.basename!.replace(/\.\w+$/i, '');
      const dirname = path.dirname(filename);

      return (
        (file.dirname?.substring(0, dirname.length) === dirname &&
          basename === '') ||
        (file.dirname === dirname && basename === sourceBasename)
      );
    });

    const pageConfig = wrapMetadata(data)(
      { filename: file.path },
      files.reduce((a, b) => {
        const data = yaml.parse(readFileSync(b).toString());
        return wrapMetadata(data)({ filename: b }, a);
      }, undefined as any)
    ).page;

    const layouts = (pageConfig?.layout ?? []).map(
      (layout: string, i: number) =>
        ({
          type: 'ImportDeclaration',
          source: { type: 'Literal', value: layout },
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
      (pageConfig?.styles ?? {}) as Record<string, string>
    ).map(
      ([name, style]: [string, string]) =>
        ({
          type: 'ImportDeclaration',
          source: { type: 'Literal', value: style },
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

    data = { ...data };

    let metadata: any = {
      type: 'CallExpression',
      optional: false,
      callee: {
        type: 'CallExpression',
        optional: false,
        callee: {
          type: 'Identifier',
          name: '__pages_wrap_metadata',
        },
        arguments: [valueToEstree(data)],
      },
      arguments: [
        { type: 'ObjectExpression', properties: [] },
        files.reduce(
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

    const _path = path
      .relative(path.resolve(process.cwd(), 'src', 'pages'), file.path)
      .split(path.delimiter);

    const resource = {
      type: 'ObjectExpression',
      properties: [
        {
          type: 'Property',
          kind: 'init',
          method: false,
          shorthand: false,
          computed: false,
          key: {
            type: 'Identifier',
            name: 'path',
          },
          value: {
            type: 'ArrayExpression',
            elements: _path.map(name => ({ type: 'Literal', value: name })),
          },
        },
        {
          type: 'Property',
          kind: 'init',
          method: false,
          shorthand: false,
          computed: false,
          key: {
            type: 'Identifier',
            name: 'slug',
          },
          value: {
            type: 'Literal',
            value: ['', ..._path].join('/'),
          },
        },
        {
          type: 'Property',
          kind: 'init',
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

    if (name) {
      metadata = name
        ? {
            type: 'ObjectExpression',
            properties: [
              {
                type: 'Property',
                kind: 'init',
                method: false,
                shorthand: false,
                computed: false,
                key: {
                  type: 'Identifier',
                  name,
                },
                value: metadata,
              },
            ],
          }
        : metadata;
    }

    const withOnce = (node: any) => {
      if (!pageConfig?.once) {
        return node;
      }

      return {
        type: 'CallExpression',
        callee: { type: 'Identifier', name: '__pages_with_once' },
        arguments: [node],
      };
    };

    imports.unshift({
      type: 'mdxjsEsm',
      value: '',
      data: {
        estree: {
          type: 'Program',
          sourceType: 'module',
          body: [
            ...(pageConfig?.once
              ? [
                  {
                    type: 'ImportDeclaration',
                    source: {
                      type: 'Literal',
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
                type: 'Literal',
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
                type: 'Literal',
                value: '@grexie/pages',
              },
              specifiers: [
                {
                  type: 'ImportSpecifier',
                  imported: { type: 'Identifier', name: 'wrapDocument' },
                  local: { type: 'Identifier', name: '__pages_wrap_document' },
                },
                {
                  type: 'ImportSpecifier',
                  imported: { type: 'Identifier', name: 'wrapResource' },
                  local: { type: 'Identifier', name: '__pages_wrap_resource' },
                },
              ],
            },
            ...layouts,
            ...styles,
            {
              type: 'ImportDeclaration',
              source: {
                type: 'Literal',
                value: '@grexie/pages-runtime-metadata',
              },
              specifiers: [
                {
                  type: 'ImportSpecifier',
                  imported: { type: 'Identifier', name: 'wrapMetadata' },
                  local: { type: 'Identifier', name: '__pages_wrap_metadata' },
                },
              ],
            },
            ...files.map(
              (file, i) =>
                ({
                  type: 'ImportDeclaration',
                  source: { type: 'Literal', value: file },
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
            {
              type: 'ExportNamedDeclaration',
              specifiers: [],
              declaration: {
                type: 'FunctionDeclaration',
                id: { type: 'Identifier', name: 'getStaticProps' },
                params: [],
                body: {
                  type: 'BlockStatement',
                  body: [
                    {
                      type: 'ReturnStatement',
                      argument: {
                        type: 'ObjectExpression',
                        properties: [
                          {
                            type: 'Property',
                            kind: 'init',
                            method: false,
                            shorthand: false,
                            computed: false,
                            key: { type: 'Identifier', name: 'props' },
                            value: metadata,
                          },
                        ],
                      },
                    },
                  ],
                },
              },
            },
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
              type: 'ExportNamedDeclaration',
              specifiers: [],
              declaration: {
                type: 'VariableDeclaration',
                kind: 'const',
                declarations: [
                  {
                    type: 'VariableDeclarator',
                    id: { type: 'Identifier', name: 'Component' },
                    init: {
                      type: 'CallExpression',
                      callee: {
                        type: 'Identifier',
                        name: '__pages_wrap_resource',
                      },
                      arguments: [
                        withOnce({
                          type: 'FunctionDeclaration',
                          id: { type: 'Identifier', name: '__pages_component' },
                          params: [{ type: 'Identifier', name: 'props' }],
                          body: {
                            type: 'BlockStatement',
                            body: [
                              ...Object.keys(pageConfig?.styles ?? {}).map(
                                name => ({
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
                                })
                              ),
                              {
                                type: 'ReturnStatement',
                                argument: {
                                  type: 'MemberExpression',
                                  object: { type: 'Identifier', name: 'props' },
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
            },
            {
              type: 'ExportDefaultDeclaration',
              specifiers: [],
              declaration: {
                type: 'CallExpression',
                callee: { type: 'Identifier', name: '__pages_wrap_document' },
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
                            (pageConfig?.layout ?? []) as string[]
                          ).reduce(
                            (node, _, i) => ({
                              type: 'CallExpression',
                              callee: {
                                type: 'Identifier',
                                name: '__pages_jsx',
                              },
                              arguments: [
                                {
                                  type: 'Identifier',
                                  name: `__pages_layout_${i}`,
                                },
                                {
                                  type: 'ObjectExpression',
                                  properties: [
                                    {
                                      type: 'Property',
                                      kind: 'init',
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
                                  name: `Component`,
                                },
                                {
                                  type: 'ObjectExpression',
                                  properties: [
                                    {
                                      type: 'Property',
                                      kind: 'init',
                                      method: false,
                                      shorthand: false,
                                      computed: false,
                                      key: {
                                        type: 'Identifier',
                                        name: 'children',
                                      },
                                      value: {
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
            {
              type: 'ExportNamedDeclaration',
              specifiers: [],
              declaration: {
                type: 'VariableDeclaration',
                kind: 'const',
                declarations: [
                  {
                    type: 'VariableDeclarator',
                    id: { type: 'Identifier', name },
                    init: metadata,
                  },
                ],
              },
            },
          ],
        },
      },
    });

    mdast.children.push(...imports);
  };
