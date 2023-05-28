import { NextConfig } from 'next';
import MDX from '@next/mdx';
import remarkFrontmatter from 'remark-frontmatter';
import { remarkPages } from './remark.js';
import { Configuration } from 'webpack';
import path from 'path';

export default () => (config: NextConfig) => {
  const nextConfigWebpack = config.webpack;

  config.webpack = function MetadataWebpackConfig(
    config: Configuration,
    context: any
  ) {
    config = nextConfigWebpack?.(config, context) ?? config;

    config?.module?.rules?.push({
      type: 'javascript/esm',
      test: /\.mdx?$/,
      enforce: 'post',
      use: [...context.defaultLoaders.pages],
      include: [path.dirname(context.config.configFile)],
      exclude: [/node_modules/, /\.pages\.mdx?$/],
    });

    return config;
  };

  config = MDX({
    extension: /\.mdx?$/,
    options: {
      jsx: true,
      remarkPlugins: [remarkFrontmatter, [remarkPages, { name: 'meta' }]],
      rehypePlugins: [],
    },
  })(config);

  return config;
};
