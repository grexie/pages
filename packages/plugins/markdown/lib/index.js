import MDX from '@next/mdx';
import remarkFrontmatter from 'remark-frontmatter';
import { remarkPages } from './remark.js';
export default (() => config => {
  config = MDX({
    extension: /\.mdx?$/,
    options: {
      jsx: true,
      remarkPlugins: [remarkFrontmatter, [remarkPages, {
        name: 'meta'
      }]],
      rehypePlugins: []
    }
  })(config);
  return config;
});
//# sourceMappingURL=index.js.map