import { WebpackManifestPlugin as ManifestPlugin } from 'webpack-manifest-plugin';
import CopyWebpackPlugin from 'copy-webpack-plugin';
import * as path from 'path';
import { Plugin } from '@grexie/pages/next';
import { Configuration } from 'webpack';
import { NextConfig } from 'next';
import { createRequire } from 'module';
import glob from 'glob';

const __filename = new URL(import.meta.url).pathname;

const require = createRequire(import.meta.url);

export type Rule = string | RegExp | ((file: string) => boolean);

export interface ServiceWorkerPluginOptions {
  exclude?: Rule | Rule[];
  external?: string | URL | (string | URL)[];
}

const ServiceWorkerPlugin: Plugin<ServiceWorkerPluginOptions> =
  ({ exclude, external } = {}) =>
  (config: NextConfig): NextConfig => {
    const nextWebpackConfig = config.webpack;

    if (!exclude) {
      exclude = [];
    }
    if (!Array.isArray(exclude)) {
      exclude = [exclude];
    }
    exclude.push('/sw.js');
    exclude = exclude.map(rule => (file: string) => {
      if (typeof rule === 'string') {
        return file.startsWith(rule);
      } else if (rule instanceof RegExp) {
        return rule.test(file);
      } else if (typeof rule === 'function') {
        return rule(file);
      } else {
        throw new TypeError('invalid rule');
      }
    });

    const filter = (file: string) => {
      const rules = exclude as ((file: string) => boolean)[];
      return !rules.reduce((a, b) => a || b(file), false);
    };

    if (!external) {
      external = [];
    }
    if (!Array.isArray(external)) {
      external = [external];
    }
    external = external.map(url => url.toString());

    config.webpack = (config: Configuration, context: any) => {
      nextWebpackConfig?.(config, context);

      config.plugins = config.plugins ?? [];

      if (!context.isServer) {
        config.plugins.push(
          new ManifestPlugin({
            basePath: '',
            publicPath: '/',
            generate(seed, files, entries) {
              let routes: any;
              try {
                routes = require(path.resolve(
                  process.cwd(),
                  '.next',
                  'routes-manifest.json'
                ));
              } catch (err) {}

              routes?.staticRoutes.forEach(({ page }: { page: string }) => {
                if (!page.endsWith('/')) {
                  page += '/';
                }

                entries[page] = [page];
              });

              const staticFiles = glob.sync('**/*', {
                cwd: path.resolve(process.cwd(), 'public'),
                nodir: true,
                dot: true,
              });

              const manifest: Record<string, string> = Object.values(
                entries
              ).reduce(
                (a: Record<string, string>, b: string[]) => ({
                  ...a,
                  ...b.reduce((a, b) => {
                    if (b.startsWith('/')) {
                      return {
                        ...a,
                        [b]: b,
                      };
                    }

                    return {
                      ...a,
                      [path.resolve('/_next', b)]: path.resolve('/_next', b),
                    };
                  }, {}),
                }),
                {}
              ) as Record<string, string>;

              for (const file of staticFiles) {
                manifest[`/${file}`] = `/${file}`;
              }

              delete manifest['/sw.js'];

              return {
                files: Object.values(manifest).filter(filter),
                external,
              };
            },
            fileName: path.resolve('public', 'assets', 'site-manifest.json'),
            filter: file => !['.map'].find(ext => file.name.endsWith(ext)),
            writeToFileEmit: true,
          }),
          new CopyWebpackPlugin({
            patterns: [
              {
                from: path.resolve(__filename, '..', 'dist', 'sw.js'),
                to: path.resolve('public', 'sw.js'),
                noErrorOnMissing: false,
              },
            ],
          })
        );
      }

      return config;
    };

    return config;
  };

export default ServiceWorkerPlugin;
