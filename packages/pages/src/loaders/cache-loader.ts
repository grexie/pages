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
                this._compiler?.inputFileSystem.stat(filename, (err, stats) => {
                  if (err) {
                    resolve(undefined);
                  }

                  resolve({
                    filename,
                    isFile: stats!.isFile(),
                    mtime: stats!.mtime.getTime(),
                  });
                })
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
          JSON.stringify({ dependencies: dependencyMap }, null, 2),
          stats.mtime
        ),
      ]);
    }
  );

  return content;
}

export async function pitch(this: LoaderContext<LoaderOptions>) {
  const { context } = this.getOptions();
  const cache = context.cache.create('webpack');

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

  return cache.lock(
    [this.resourcePath, `${this.resourcePath}.webpack.json`],
    async cache => {
      if (await cache.has(this.resourcePath)) {
        if (!(await hasChanged(cache, this.resourcePath))) {
          return await cache.get(this.resourcePath);
        }
      }
    }
  );
}
