import webpack, { Stats } from 'webpack';
import { Configuration, EntryObject } from 'webpack';
import { MountOptions, Store } from './Store';
import { EventEmitter } from 'events';

export type { Configuration, EntryObject };
export type { Stats };

export interface BuildOptions {
  config: Configuration;
}

export interface BuilderOptions {
  mounts?: MountOptions[];
}

export class Watcher extends EventEmitter {
  readonly #watching: webpack.Watching;

  constructor(compiler: webpack.Compiler) {
    super();

    this.#watching = compiler.watch(
      {},
      (err: Error | null | undefined, stats?: webpack.Stats) => {
        this.emit('build', err, stats);
      }
    );
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.#watching.close((err: Error | null | undefined) => {
        if (err) {
          reject(err);
          return;
        }

        resolve();
      });
    });
  }
}

export class Builder {
  readonly store: Store;

  constructor({ mounts }: BuilderOptions = {}) {
    this.store = new Store({ mounts });
  }

  async build({ config }: BuildOptions): Promise<webpack.Stats> {
    const compiler = webpack(config);

    compiler.inputFileSystem = this.store;
    compiler.outputFileSystem = this.store;

    return new Promise<webpack.Stats>((resolve, reject) =>
      compiler.run((err, stats) => {
        if (err) {
          reject(err);
          return;
        }

        resolve(stats!);
      })
    );
  }

  watch({ config }: BuildOptions): Watcher {
    const compiler = webpack(config);

    compiler.inputFileSystem = this.store;
    compiler.outputFileSystem = this.store;

    return new Watcher(compiler);
  }
}
