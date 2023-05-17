import { NextConfig } from 'next';
export type { StyleSheet } from '@grexie/pages-runtime-styles';

export default function SassPagesPlugin() {
  return function SassNextPlugin(config: NextConfig) {
    const nextConfigWebpack = config.webpack;

    config.webpack = function SassWebpackConfig(config, context: any) {
      config = nextConfigWebpack?.(config, context) ?? config;

      config.module?.rules?.unshift(
        {
          type: 'javascript/esm',
          test: /\.s[ac]ss$/,
          use: [
            '@grexie/pages-style-loader',
            {
              loader: 'css-loader',
              options: {
                esModule: false,
                sourceMap: false,
              },
            },
            {
              loader: 'sass-loader',
            },
          ],
          include: /\.global\.s[ac]ss$/,
        },
        {
          type: 'javascript/esm',
          test: /\.s[ac]ss$/,
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
                        localIdentName:
                          '[path][name]__[local]--[hash:base64:5]',
                      },
              },
            },
            {
              loader: 'sass-loader',
            },
          ],
          include: /\.module\.s[ac]ss$/,
        }
      );

      return config;
    };
    return config;
  };
}
