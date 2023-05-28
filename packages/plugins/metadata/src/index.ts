import { NextConfig } from 'next';
import type { Configuration, RuleSetRule } from 'webpack';
import path from 'path';
import BabelPagesPlugin from './babel.js';
import { Plugin } from '@grexie/pages/next';
import { WebpackPagesPlugin } from './webpack.js';
import { createRequire } from 'module';

const __dirname = path.dirname(new URL(import.meta.url).pathname);

const require = createRequire(import.meta.url);

export interface PagesMetadataPluginOptions {}

const PagesMetadataPlugin: Plugin<PagesMetadataPluginOptions> =
  ({} = {}, { pagesDir }) =>
  (config: NextConfig) => {
    const nextConfigWebpack = config.webpack;

    const plugin = new WebpackPagesPlugin({ pagesDir });

    config.webpack = function MetadataWebpackConfig(
      config: Configuration,
      context: any
    ) {
      context.defaultLoaders.pages = [
        {
          loader: 'babel-loader',
          options: {
            presets: [['@babel/env', { modules: false }]],
            plugins: [
              '@babel/syntax-jsx',
              ['@babel/syntax-typescript', { isTSX: true }],
              [
                BabelPagesPlugin,
                {
                  pagesDir,
                  plugin,
                },
              ],
            ],
            sourceMaps: true,
            compact: false,
          },
        },
      ];

      // if (!context.isServer) {
      //   context.defaultLoaders.pages.unshift({
      //     loader: '@grexie/pages-plugin-metadata/loader',
      //     options: {
      //       pagesDir,
      //       plugin,
      //     },
      //   });
      // }

      config = nextConfigWebpack?.(config, context) ?? config;

      if (context.isServer) {
        config.plugins = config.plugins ?? [];
        config.plugins.unshift(plugin);
      }

      // const extendCodeRule = (rule: RuleSetRule) => {
      //   if (rule.oneOf) {
      //     rule.oneOf.map(extendCodeRule);
      //     return;
      //   }

      //   if (rule.test) {
      //     if (/js/.test(rule.test.toString())) {
      //       if (rule.use && !rule.issuerLayer) {
      //         if (!Array.isArray(rule.use)) {
      //           rule.use = [rule.use as any];
      //         }
      //         rule.use.push(...context.defaultLoaders.pages);
      //       }
      //     }
      //   }
      // };

      const rootDir = process.cwd();
      const apiDir = path.resolve(pagesDir, 'api');

      if (context.isServer) {
        config.module?.rules?.push({
          type: 'javascript/esm',
          test: require.resolve('@grexie/pages-plugin-metadata/loader'),
          use: [
            {
              loader: '@grexie/pages-json-loader',
            },
            {
              loader: '@grexie/pages-plugin-metadata/loader',
              options: {
                pagesDir,
                plugin,
              },
            },
          ],
          sideEffects: false,
        });
      }

      config.module?.rules?.push(
        {
          type: 'javascript/esm',
          test: /\.[cm]?[jt]sx?$/,
          use: [...context.defaultLoaders.pages],
          include: [
            request => {
              return (
                request.substring(0, rootDir.length) === rootDir &&
                request.substring(0, apiDir.length) !== apiDir
              );
            },
          ],
          exclude: [
            /node_modules/,
            /\/_app\.[cm]?[jt]sx?$/,
            /\/_document\.[cm]?[jt]sx?$/,
            /\/mdx-components\.[cm]?[jt]sx?$/,
            /\.pages\.[cm]?[jt]sx?$/,
            /next\.config\.m?js$/,
          ],
          sideEffects: true,
        },
        {
          type: 'javascript/esm',
          test: /\.pages\.[cm]?jsx?$/,
          use: [
            '@grexie/pages-metadata-loader',
            {
              loader: 'babel-loader',
              options: {
                presets: ['@babel/react', ['@babel/env', { modules: false }]],
                sourceMaps: true,
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
                sourceMaps: true,
                compact: false,
              },
            },
          ],
        },
        {
          type: 'javascript/esm',
          test: /\.ya?ml$/,
          use: '@grexie/pages-yaml-loader',
          exclude: [/node_modules/, /\.pages\.ya?ml$/],
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

export default PagesMetadataPlugin;
