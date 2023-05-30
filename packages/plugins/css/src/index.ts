import { NextConfig } from 'next';
import { Configuration } from 'webpack';
export type { StyleSheet } from '@grexie/pages-runtime-styles';

export default function CssPagesPlugin() {
  return function CssNextPlugin(config: NextConfig) {
    const nextConfigWebpack = config.webpack;

    config.webpack = function CssWebpackConfig(
      config: Configuration,
      context: any
    ) {
      config = nextConfigWebpack?.(config, context) ?? config;

      config.module?.rules?.unshift(
        {
          type: 'javascript/esm',
          test: /\.css$/,
          use: [
            '@grexie/pages-style-loader',
            {
              loader: 'css-loader',
              options: {
                esModule: false,
                sourceMap: false,
              },
            },
          ],
        },
        {
          type: 'javascript/esm',
          test: /\.css$/,
          use: [
            '@grexie/pages-style-loader',
            {
              loader: 'css-loader',
              options: {
                esModule: false,
                sourceMap: false,
              },
            },
          ],
          include: /\.global\.css$/,
        },
        {
          type: 'javascript/esm',
          test: /\.css$/,
          use: [
            '@grexie/pages-style-loader',
            {
              loader: 'css-loader',
              options: {
                esModule: false,
                sourceMap: false,
                modules:
                  process.env.NODE_ENV === 'production'
                    ? true
                    : {
                        localIdentName: '[name]__[local]--[hash:base64:5]',
                      },
              },
            },
          ],
          include: /\.module\.css$/,
        }
      );

      return config;
    };
    return config;
  };
}
