import { Plugin } from 'unified';
import mdx from 'remark-mdx';
import { strip } from './strip.js';
import { unified } from 'unified';
import parse from 'remark-parse';
import stringify from 'remark-stringify';
import frontmatter from 'remark-frontmatter';

export interface RemarkPagesOptions {
  excerptLength?: number;
}

export const remarkExcerpt: Plugin<[RemarkPagesOptions]> =
  ({ excerptLength = 300 } = {}) =>
  (ast, file) => {
    let excerpt = unified()
      .use(parse as any)
      .use(stringify)
      .use(frontmatter)
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
    file.data.excerpt = excerpt;

    return ast;
  };
