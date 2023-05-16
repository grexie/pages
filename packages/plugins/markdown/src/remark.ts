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

/**
 * A remark plugin to expose frontmatter data as getStaticProps.
 *
 * @param options - Optional options to configure the output.
 * @returns A unified transformer.
 */
export const remarkPages: Plugin<[RemarkPagesOptions?]> =
  ({ name } = {}) =>
  (ast, file) => {
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

    imports.unshift({
      type: 'mdxjsEsm',
      value: '',
      data: {
        estree: {
          type: 'Program',
          sourceType: 'module',
          body: [
            {
              type: 'ExportNamedDeclaration',
              specifiers: [],
              declaration: {
                type: 'VariableDeclaration',
                kind: 'const',
                declarations: [
                  {
                    type: 'VariableDeclarator',
                    id: { type: 'Identifier', name: 'metadata' },
                    init: valueToEstree(data),
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
