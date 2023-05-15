import { NextConfig } from 'next';
import type { Configuration } from 'webpack';

export default () => (config: NextConfig) => {
  const nextConfigWebpack = config.webpack;

  config.webpack = function MetadataWebpackConfig(
    config: Configuration,
    context: any
  ) {
    config = nextConfigWebpack?.(config, context) ?? config;

    config.module?.rules?.unshift(
      {
        type: 'javascript/esm',
        test: /\.pages\.[cm]?jsx?$/,
        use: [
          '@grexie/pages-metadata-loader',
          {
            loader: 'babel-loader',
            options: {
              presets: ['@babel/react', ['@babel/env', { modules: false }]],
              sourceMaps: !!config.devtool,
              compact: false,
            },
          },
        ],
      },
      {
        type: 'javascript/esm',
        test: /\.pages\.[cm]?tsx?$/,
        use: [
          '@grexie/pages-metadata-loader',
          {
            loader: 'babel-loader',
            options: {
              presets: [
                '@babel/typescript',
                '@babel/react',
                ['@babel/env', { modules: false }],
              ],
              sourceMaps: !!config.devtool,
              compact: false,
            },
          },
        ],
      },
      {
        type: 'javascript/esm',
        test: /\.pages\.ya?ml$/,
        use: [
          '@grexie/pages-metadata-loader',
          {
            loader: '@grexie/pages-yaml-loader',
            options: {
              transform: (doc: any) => {
                delete doc.page;
                return doc;
              },
            },
          },
        ],
      },
      {
        type: 'javascript/esm',
        test: /\.pages\.json$/,
        use: [
          '@grexie/pages-metadata-loader',
          {
            loader: '@grexie/pages-json-loader',
            options: {
              transform: (doc: any) => {
                delete doc.page;
                return doc;
              },
            },
          },
        ],
      }
    );

    return config;
  };
  return config;
};
