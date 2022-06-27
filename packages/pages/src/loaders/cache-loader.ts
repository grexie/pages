import type { LoaderContext } from 'webpack';
import { BuildContext } from '../builder';
import path from 'path';
import { ICache } from '@grexie/builder';

interface LoaderOptions {
  context: BuildContext;
}

export default async function CacheLoader(
  this: LoaderContext<LoaderOptions>,
  content: Buffer
) {
  const { context } = this.getOptions();
  const cache = context.cache.create('webpack');

  return cache.lock(
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

      let dependencies = Array.from(new Set(this.getDependencies()));
      const dependencyStats = await Promise.all(
        dependencies.map(
          filename =>
            new Promise<any>(resolve =>
              this._compiler?.inputFileSystem.stat(filename, (err, stats) => {
                if (err) {
                  resolve({ filename, isFile: false });
                }

                resolve({ filename, isFile: stats?.isFile() });
              })
            )
        )
      );
      dependencies = dependencyStats
        .filter(({ isFile }) => isFile)
        .map(({ filename }) => filename) as string[];

      await Promise.all([
        cache.set(this.resourcePath, content, stats.mtime),
        cache.set(
          `${this.resourcePath}.webpack.json`,
          JSON.stringify({ dependencies }, null, 2),
          stats.mtime
        ),
      ]);
    }
  );
}

export async function pitch(this: LoaderContext<LoaderOptions>) {
  const { context } = this.getOptions();
  const cache = context.cache.create('webpack');

  const hasChanged = async (cache: ICache, filename: string) => {
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

    return !stats || stats.mtime.getTime() > cached.getTime();
  };

  return cache.lock(
    [this.resourcePath, `${this.resourcePath}.webpack.json`],
    async cache => {
      if (await cache.has(this.resourcePath)) {
        const { dependencies } = JSON.parse(
          (await cache.get(`${this.resourcePath}.webpack.json`)).toString()
        ) as { dependencies: string[] };

        if (!dependencies.includes(this.resourcePath)) {
          dependencies.unshift(this.resourcePath);
        }

        const results = await cache.lock(dependencies, async cache =>
          Promise.all(dependencies.map(filename => hasChanged(cache, filename)))
        );

        const changed = results.reduce((a, b) => a || b, false);

        if (!changed) {
          return await cache.get(this.resourcePath);
        } else {
          await cache.remove(this.resourcePath);
        }
      }
    }
  );
}
