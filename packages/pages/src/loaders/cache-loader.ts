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

  await context.ephemeralCache.lock(
    [this.resourcePath, path.join(this.resourcePath, 'meta')],
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
            new Promise<any>((resolve, reject) =>
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
          path.join(this.resourcePath, 'meta'),
          JSON.stringify({ dependencies }, null, 2),
          stats.mtime
        ),
      ]);
    }
  );

  return content;
}

export async function pitch(this: LoaderContext<LoaderOptions>) {
  const { context } = this.getOptions();

  const hasChanged = async (cache: ICache, filename: string) => {
    if (!(await cache.has(filename))) {
      return false;
    }

    const [cached, stats] = await Promise.all([
      cache.modified(filename),
      new Promise<any>((resolve, reject) =>
        this._compiler?.inputFileSystem.stat(filename, (err, stats) => {
          if (err) {
            reject(err);
            return;
          }

          resolve(stats);
        })
      ),
    ]);

    return stats.mtime.getTime() > cached.getTime();
  };

  return context.ephemeralCache.lock(
    [this.resourcePath, path.join(this.resourcePath, 'meta')],
    async cache => {
      if (await cache.has(this.resourcePath)) {
        const { dependencies } = JSON.parse(
          (await cache.get(path.join(this.resourcePath, 'meta'))).toString()
        ) as { dependencies: string[] };

        const results = await cache.lock(
          [this.resourcePath, ...dependencies],
          async cache =>
            Promise.all(
              [this.resourcePath, ...dependencies].map(filename =>
                hasChanged(cache, filename)
              )
            )
        );
        const changed = results.reduce((a, b) => a || b, false);

        if (!changed) {
          return cache.get(this.resourcePath);
        }
      }
    }
  );
}
