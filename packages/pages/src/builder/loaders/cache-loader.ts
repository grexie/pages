import type { LoaderContext } from 'webpack';
import { BuildContext } from '../BuildContext.js';
import { ICache } from '@grexie/builder/Cache.js';
import { createResolver } from '../../utils/resolvable.js';

interface LoaderOptions {
  context: BuildContext;
}

export default async function CacheLoader(
  this: LoaderContext<LoaderOptions>,
  content: Buffer,
  inputSourceMap: any,
  additionalData: any
) {
  const { context } = this.getOptions();
  const callback = this.async();

  try {
    const cache = context.cache.create('webpack');

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

        const dependencies = Array.from(new Set(this.getDependencies()));
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
          cache.set(
            `${this.resourcePath}.webpack.json`,
            JSON.stringify(
              {
                map: inputSourceMap,
                meta: additionalData,
                dependencies: dependencyMap,
              },
              null,
              2
            ),
            stats.mtime
          ),
        ]);
      }
    );

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

  const cache = context.cache.create('webpack');
  try {
    const { content, map, meta } = await cache.lock<{
      content?: Buffer;
      map?: any;
      meta?: any;
    }>('cache-loader', async cache => {
      if (process.env.PAGES_DEBUG_LOADERS === 'true') {
        console.info('cache-loader:pitch', this.resourcePath);
      }

      try {
        const hasChanged = async (
          cache: ICache,
          filename: string,
          mtime: number = Number.MAX_VALUE
        ): Promise<boolean> => {
          if (!(await cache.has(filename))) {
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

          const { dependencies } = JSON.parse(
            (await cache.get(`${filename}.webpack.json`)).toString()
          ) as { dependencies: Record<string, number> };

          if (dependencies[filename]) {
            delete dependencies[filename];
          }

          const results = await cache.lock(
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

        const result = await cache.lock(
          [this.resourcePath, `${this.resourcePath}.webpack.json`],
          async cache => {
            try {
              if (await cache.has(this.resourcePath)) {
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
              console.info(err);
              throw err;
            }
          }
        );
        return result;
      } finally {
        if (process.env.PAGES_DEBUG_LOADERS === 'true') {
          console.info('cache-loader:pitch-complete', this.resourcePath);
        }
      }
    });
    callback(null, content, map, meta);
  } catch (err) {
    callback(err as any);
  }
}
