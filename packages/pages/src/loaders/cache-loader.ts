import type { LoaderContext } from 'webpack';
import { BuildContext } from '../builder';
import path from 'path';
interface LoaderOptions {
  context: BuildContext;
}

export default async function CacheLoader(
  this: LoaderContext<LoaderOptions>,
  content: Buffer
) {
  console.time(`cache-loader:pitch ${this.resourcePath}`);
  try {
    const { context } = this.getOptions();

    await context.ephemeralCache.lock(this.resourcePath, async cache => {
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

      await Promise.all([
        cache.set(this.resourcePath, content, stats.mtime),
        cache.set(
          path.join(this.resourcePath, 'meta'),
          JSON.stringify({ dependencies: this.getDependencies() }, null, 2),
          stats.mtime
        ),
      ]);
    });

    return content;
  } finally {
    console.timeEnd(`cache-loader ${this.resourcePath}`);
  }
}

export async function pitch(this: LoaderContext<LoaderOptions>) {
  console.time(`cache-loader:pitch ${this.resourcePath}`);
  const { context } = this.getOptions();

  return context.ephemeralCache
    .lock(this.resourcePath, async cache => {
      const hasChanged = async (filename: string) => {
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

      if (await cache.has(this.resourcePath)) {
        const { dependencies } = JSON.parse(
          (await cache.get(path.join(this.resourcePath, 'meta'))).toString()
        );

        const changed = (
          await Promise.all(
            [this.resourcePath, ...dependencies].map(filename =>
              hasChanged(filename)
            )
          )
        ).reduce((a, b) => a || b, false);

        if (!changed) {
          return context.ephemeralCache.get(this.resourcePath);
        }
      }
    })
    .finally(() => console.timeEnd(`cache-loader:pitch ${this.resourcePath}`));
}
