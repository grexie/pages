import { valueToEstree } from 'estree-util-value-to-estree';
import { load } from 'js-yaml';
import { Root, YAML } from 'mdast';
import { MdxjsEsm } from 'mdast-util-mdx';
import { parse } from 'toml';
import { Plugin } from 'unified';

export const remarkPages: Plugin<[{}]> = () => ast => {
  const mdast = ast as Root;
  const imports: MdxjsEsm[] = [];

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
