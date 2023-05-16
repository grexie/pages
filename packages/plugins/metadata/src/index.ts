import { NextConfig } from 'next';
import type { Configuration } from 'webpack';
import path from 'path';
import BabelPagesPlugin from './babel.js';
import { Plugin } from '@grexie/pages/next';

const __dirname = path.dirname(new URL(import.meta.url).pathname);

export interface PagesMetadataPluginOptions {}

const PagesMetadataPlugin: Plugin<PagesMetadataPluginOptions> =
  ({} = {}, { pagesDir }) =>
  (config: NextConfig) => {
    const nextConfigWebpack = config.webpack;

    config.webpack = function MetadataWebpackConfig(
      config: Configuration,
      context: any
    ) {
      context.defaultLoaders.pages = [
        {
          loader: 'babel-loader',
          options: {
            presets: [['@babel/env', { modules: false }]],
            plugins: [[BabelPagesPlugin, { pagesDir }]],
            sourceMaps: !!config.devtool,
            compact: false,
          },
        },
      ];

      config = nextConfigWebpack?.(config, context) ?? config;

      const rootDir = path.dirname(context.config.configFile);

      config.module?.rules?.unshift({
        type: 'javascript/esm',
        test: /\.[cm]?[jt]sx?$/,
        use: [...context.defaultLoaders.pages],
        include: [
          request => {
            return request.substring(0, rootDir.length) === rootDir;
          },
        ],
        exclude: [/node_modules/, /\.pages\.[cm]?[jt]sx?$/],
      });

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
                  console.info(doc);
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
