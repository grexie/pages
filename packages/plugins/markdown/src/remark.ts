import { valueToEstree } from 'estree-util-value-to-estree';
import { load } from 'js-yaml';
import { Root, YAML } from 'mdast';
import { MdxjsEsm } from 'mdast-util-mdx';
import { parse } from 'toml';
import { Plugin } from 'unified';
import excerptAst from 'mdast-excerpt';
import { strip } from './strip.js';
import remarkMdx from 'remark-mdx';
import { remark } from 'remark';
import remarkStringify from 'remark-stringify';

export interface RemarkPagesOptions {
  excerptLength?: number;
}

export const remarkPages: Plugin<[RemarkPagesOptions]> =
  ({ excerptLength = 150 }) =>
  ast => {
    const mdast = ast as Root;
    const imports: MdxjsEsm[] = [];

    let data: any;

    for (const node of mdast.children) {
      const { value } = node as YAML;
      if (node.type === 'yaml') {
        data = load(value);
        mdast.children.splice(mdast.children.indexOf(node), 1);
        // @ts-expect-error A custom node type may be registered for TOML frontmatter data.
      } else if (node.type === 'toml') {
        data = parse(value);
        mdast.children.splice(mdast.children.indexOf(node), 1);
      }
    }

    data = data ?? {};

    const file = remark()
      .use(remarkStringify)
      .use(remarkMdx as any)
      .stringify(ast as any)
      .toString();

    try {
      data.excerpt = remark()
        .use(remarkMdx as any)
        .use(strip)
        .processSync(file)
        .toString()
        .replace(/\s+/g, ' ');

      if (data.excerpt.trim().length > excerptLength - 1) {
        data.excerpt =
          data.excerpt.trim().substring(0, excerptLength - 1) + '…';
      } else {
        data.excerpt = data.excerpt.trim();
      }
    } catch (err) {
      data.excerpt = '';
    }

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
