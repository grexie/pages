import type { LoaderContext } from 'webpack';
import type { BuildContext } from '../BuildContext.js';
import type { ICache, IReadOnlyCache } from '@grexie/builder/Cache.js';
import { timedAsync } from '../../utils/timed.js';
import webpack from 'webpack';

interface LoaderOptions {
  context: BuildContext;
}

const DependencyTable = new WeakMap<webpack.Compiler, DependencyCache>();

class DependencyCache {
  readonly cache: Record<string, Record<string, number>> = {};

  static get(compiler: webpack.Compiler) {
    if (!DependencyTable.has(compiler.root)) {
      DependencyTable.set(compiler.root, new DependencyCache());
    }
    return DependencyTable.get(compiler.root)!;
  }

  async get(
    cache: IReadOnlyCache,
    filename: string
  ): Promise<Record<string, number>> {
    if (filename in this.cache) {
      return this.cache[filename];
    }
    const { dependencies } = JSON.parse(
      (await cache.get(`${filename}.webpack.json`)).toString()
    );
    this.cache[filename] = dependencies;
    return dependencies;
  }

  async set(
    cache: ICache,
    filename: string,
    {
      dependencies,
      ...other
    }: Record<string, any> & {
      dependencies: Record<string, number>;
    },
    mtime: number
  ): Promise<void> {
    this.cache[filename] = dependencies;
    return cache.set(
      `${filename}.webpack.json`,
      JSON.stringify({ dependencies, ...other }),
      mtime
    );
  }

  async has(cache: IReadOnlyCache, filename: string): Promise<boolean> {
    if (filename in this.cache) {
      return true;
    }
    const has = await cache.has(filename);
    return has;
  }
}

export default async function CacheLoader(
  this: LoaderContext<LoaderOptions>,
  content: Buffer,
  inputSourceMap: any,
  additionalData: any
) {
  const { context } = this.getOptions();
  const callback = this.async();
  this.cacheable(false);

  const dependencyCache = DependencyCache.get(this._compiler!);

  try {
    const cache = context.cache.create('pages-cache-loader');

    await cache.lock('cache-loader', async cache => {
      if (process.env.PAGES_DEBUG_LOADERS === 'true') {
        console.info('cache-loader', this.resourcePath);
      }

      await cache.lock(
        [this.resourcePath, `${this.resourcePath}.webpack.json`],
        async cache => {
          const stats = await new Promise<any>((resolve, reject) =>
            this._compiler?.inputFileSystem.stat(
              this.resourcePath,
              (err, stats) => {
                if (err) {
                  reject(err);
                  return;
                }

                resolve(stats);
              }
            )
          );

          const dependencies = [...new Set(this.getDependencies())];
          const dependencyStats = (
            await Promise.all(
              dependencies.map(
                filename =>
                  new Promise<any>(resolve =>
                    this._compiler?.inputFileSystem.stat(
                      filename,
                      (err, stats) => {
                        if (err) {
                          resolve(undefined);
                        }

                        resolve({
                          filename,
                          isFile: stats!.isFile(),
                          mtime: stats!.mtime.getTime(),
                        });
                      }
                    )
                  )
              )
            )
          ).filter(x => !!x) as {
            filename: string;
            isFile: boolean;
            mtime: number;
          }[];

          const dependencyMap = dependencyStats
            .filter(({ isFile }) => isFile)
            .map(({ filename, mtime }) => ({ [filename]: mtime }))
            .reduce((a, b) => ({ ...a, ...b }), {});

          await Promise.all([
            cache.set(this.resourcePath, content, stats.mtime),
            dependencyCache.set(
              cache,
              this.resourcePath,
              {
                map: inputSourceMap,
                meta: additionalData,
                dependencies: dependencyMap,
              },
              stats.mtime
            ),
          ]);
        }
      );
    });

    callback(null, content, inputSourceMap, additionalData);
  } catch (err) {
    callback(err as any);
  } finally {
    if (process.env.PAGES_DEBUG_LOADERS === 'true') {
      console.info('cache-loader:complete', this.resourcePath);
    }
  }
}

export async function pitch(this: LoaderContext<LoaderOptions>) {
  const { context } = this.getOptions();
  const callback = this.async();
  this.cacheable(false);

  const dependencyCache = DependencyCache.get(this._compiler!);

  const cache = context.cache.create('pages-cache-loader');
  try {
    if (process.env.PAGES_DEBUG_LOADERS === 'true') {
      console.info('cache-loader:pitch', this.resourcePath);
    }

    const { content, map, meta } = await cache.readLock(
      'cache-loader',
      async cache => {
        const hasChanged = async (
          cache: IReadOnlyCache,
          filename: string,
          mtime: number = Number.MAX_VALUE
        ): Promise<boolean> => {
          if (!(await dependencyCache.has(cache, filename))) {
            return false;
          }

          const [cached, stats] = await Promise.all([
            cache.modified(filename),
            new Promise<any>(resolve =>
              this._compiler?.inputFileSystem.stat(filename, (err, stats) => {
                if (err) {
                  resolve(null);
                  return;
                }

                resolve(stats);
              })
            ),
          ]);

          if (
            !stats ||
            cached.getTime() > mtime ||
            stats.mtime.getTime() > cached.getTime()
          ) {
            return true;
          }

          const dependencies = await dependencyCache.get(cache, filename);

          if (dependencies[filename]) {
            delete dependencies[filename];
          }

          const results = await cache.readLock(
            [
              ...Object.keys(dependencies),
              ...Object.keys(dependencies).map(
                filename => `${filename}.webpack.json`
              ),
            ],
            async cache =>
              Promise.all(
                Object.entries(dependencies).map(([filename, mtime]) =>
                  hasChanged(cache, filename, mtime)
                )
              )
          );

          return results.reduce((a, b) => a || b, false);
        };

        const results = await cache.readLock(
          [this.resourcePath, `${this.resourcePath}.webpack.json`],
          async cache => {
            try {
              if (await dependencyCache.has(cache, this.resourcePath)) {
                if (!(await hasChanged(cache, this.resourcePath))) {
                  const [content, _webpack] = await Promise.all([
                    cache.get(this.resourcePath),
                    cache.get(`${this.resourcePath}.webpack.json`),
                  ]);
                  return { content, ...JSON.parse(_webpack.toString()) };
                }
              }
              return {};
            } catch (err) {
              throw err;
            }
          }
        );

        return results;
      }
    );

    return callback(null, content, map, meta);
  } catch (err) {
    callback(err as any);
  } finally {
    if (process.env.PAGES_DEBUG_LOADERS === 'true') {
      console.info('cache-loader:pitch-complete', this.resourcePath);
    }
  }
}
