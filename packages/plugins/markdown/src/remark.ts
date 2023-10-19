import { valueToEstree } from 'estree-util-value-to-estree';
import { load } from 'js-yaml';
import { Root, YAML } from 'mdast';
import { MdxjsEsm } from 'mdast-util-mdx';
import { parse } from 'toml';
import remarkParse from 'remark-parse';
import { unified, Plugin } from 'unified';
import { strip } from './strip.js';
import mdx from 'remark-mdx';
import frontmatter from 'remark-frontmatter';
import stringify from 'remark-stringify';

export interface RemarkPagesOptions {
  excerptLength?: number;
}

export const remarkPages: Plugin<[RemarkPagesOptions]> =
  ({ excerptLength = 300 }) =>
  (ast, file) => {
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

    let excerpt = unified()
      .use(remarkParse as any)
      .use(stringify)
      .use(frontmatter as any)
      .use(mdx as any)
      .use(strip)
      .processSync(file)
      .toString()
      .replace(/\s+/g, ' ');

    if (excerpt.trim().length > excerptLength - 1) {
      excerpt = excerpt.trim().substring(0, excerptLength - 1) + '…';
    } else {
      excerpt = excerpt.trim();
    }
    data.excerpt = excerpt;

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
