import webpack, { Configuration, EntryObject } from 'webpack';
import { FileSystem } from './FileSystem.js';
import { EventEmitter } from 'events';

export type WebpackStats = webpack.Stats;
export type { Configuration, EntryObject };

export interface BuildOptions {
  config: Configuration;
}

export interface BuilderOptions {}

export class Watcher extends EventEmitter {
  readonly #watching: webpack.Watching;

  constructor(compiler: webpack.Compiler) {
    super();

    this.#watching = compiler.watch(
      {},
      (err: Error | null | undefined, stats?: WebpackStats) => {
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
  readonly fs = new FileSystem();

  constructor({}: BuilderOptions = {}) {}

  compiler({ config }: BuildOptions): webpack.Compiler {
    const compiler = webpack(config);

    compiler.inputFileSystem = this.fs;
    compiler.outputFileSystem = this.fs;

    return compiler;
  }

  async build({ config }: BuildOptions): Promise<WebpackStats> {
    const compiler = this.compiler({ config });

    return new Promise<WebpackStats>((resolve, reject) =>
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
    const compiler = this.compiler({ config });
    return new Watcher(compiler);
  }
}
