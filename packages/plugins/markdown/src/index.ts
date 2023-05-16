import { NextConfig } from 'next';
import MDX from '@next/mdx';
import remarkFrontmatter from 'remark-frontmatter';
import { remarkPages } from './remark.js';
import { Configuration } from 'webpack';
import path from 'path';

export default () => (config: NextConfig) => {
  config = MDX({
    extension: /\.mdx?$/,
    options: {
      jsx: true,
      remarkPlugins: [remarkFrontmatter, [remarkPages, { name: 'meta' }]],
      rehypePlugins: [],
    },
  })(config);

  const nextConfigWebpack = config.webpack;

  config.webpack = function MetadataWebpackConfig(
    config: Configuration,
    context: any
  ) {
    config = nextConfigWebpack?.(config, context) ?? config;

    config?.module?.rules?.unshift({
      type: 'javascript/esm',
      test: /\.mdx?$/,
      use: [...context.defaultLoaders.pages],
      include: [path.dirname(context.config.configFile)],
      exclude: [/node_modules/, /\.pages\.mdx?$/],
    });

    return config;
  };

  return config;
};
