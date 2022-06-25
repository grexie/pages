import { FileSystem } from './FileSystem';
import os from 'os';
import path from 'path';
import { createHash } from 'crypto';
import { createResolver } from '@grexie/pages/utils/resolvable';

export interface ICache {
  set: (
    filename: string,
    content: Buffer | string,
    modified: Date | number
  ) => Promise<void>;
  get: (filename: string) => Promise<Buffer>;
  has: (filename: string) => Promise<boolean>;
  remove: (filename: string) => Promise<void>;
  modified: (filename: string) => Promise<Date>;
}

export class Cache implements ICache {
  readonly #fs: FileSystem;
  readonly #cacheDir: string;
  readonly #locks: Record<string, Promise<void>> = {};
  readonly #keys: Record<string, string> = {};

  constructor(fs: FileSystem, cacheDir: string = os.tmpdir()) {
    this.#fs = fs;
    this.#cacheDir = cacheDir;
  }

  #key(filename: string) {
    if (this.#keys[filename]) {
      return this.#keys[filename];
    }

    const hash = createHash('sha1');
    hash.update(filename);
    const key = Array.from(hash.digest().toString('hex'));
    return path.resolve(
      this.#cacheDir,
      path.join(...key.slice(0, 5), key.slice(5).join(''))
    );
  }

  async lock<T = any>(
    filename: string,
    cb: (cache: ICache) => Promise<T>
  ): Promise<T> {
    const key = this.#key(filename);
    this.#keys[filename] = key;
    const promise = this.#locks[key];
    const resolver = createResolver<void>();
    this.#locks[key] = resolver;
    await promise;

    const locks = {} as Record<string, Promise<any>>;

    const wrap = (
      cb: (filename: string, ...args: any[]) => Promise<any>
    ): any => {
      return async (filename: string, ...args: any[]): Promise<any> => {
        const promise = this.#locks[key];
        const resolver = createResolver<void>();
        locks[filename] = resolver;
        await promise;

        try {
          return cb(filename, ...args);
        } finally {
          resolver.resolve();
        }
      };
    };

    const cache = {
      set: wrap(this.#set.bind(this)),
      get: wrap(this.#get.bind(this)),
      has: wrap(this.#has.bind(this)),
      remove: wrap(this.#remove.bind(this)),
      modified: wrap(this.#modified.bind(this)),
    } as ICache;

    try {
      return cb(cache);
    } finally {
      delete this.#keys[filename];
      resolver.resolve();
    }
  }

  async #set(
    filename: string,
    content: Buffer | string,
    modified: Date | number = Date.now()
  ): Promise<void> {
    const key = this.#key(filename);

    await Promise.all([
      new Promise<void>((resolve, reject) => {
        this.#fs.writeFile(
          `${key}.stats`,
          JSON.stringify({ mtime: new Date(modified).getTime() }),
          err => {
            if (err) {
              reject(err);
              return;
            }

            resolve();
          }
        );
      }),
      new Promise<void>((resolve, reject) => {
        this.#fs.writeFile(key, content, err => {
          if (err) {
            reject(err);
            return;
          }

          resolve();
        });
      }),
    ]);
  }

  async set(
    filename: string,
    content: Buffer | string,
    modified: Date | number = Date.now()
  ) {
    return this.lock(filename, () => this.#set(filename, content, modified));
  }

  async #get(filename: string): Promise<Buffer> {
    const key = this.#key(filename);

    return new Promise((resolve, reject) => {
      this.#fs.readFile(key, (err, content) => {
        if (err) {
          reject(err);
          return;
        }

        resolve(Buffer.from(content!));
      });
    });
  }

  async get(filename: string) {
    return this.#get(filename);
  }

  async #has(filename: string): Promise<boolean> {
    const key = this.#key(filename);
    return new Promise(resolve => {
      this.#fs.stat(key, (err, stats) => {
        if (err) {
          resolve(false);
          return;
        }

        resolve(true);
      });
    });
  }

  async has(filename: string): Promise<boolean> {
    return this.#has(filename);
  }

  async #remove(filename: string): Promise<void> {
    const key = this.#key(filename);

    await Promise.all([
      new Promise<void>((resolve, reject) => {
        this.#fs.unlink!(`${key}.stats`, err => {
          if (err) {
            reject(err);
            return;
          }

          resolve();
        });
      }),
      new Promise<void>((resolve, reject) => {
        this.#fs.unlink!(key, err => {
          if (err) {
            reject(err);
            return;
          }

          resolve();
        });
      }),
    ]);
  }

  async remove(filename: string) {
    this.#remove(filename);
  }

  async #modified(filename: string): Promise<Date> {
    const key = this.#key(filename);

    const json = await new Promise<string>((resolve, reject) => {
      this.#fs.readFile(`${key}.stats`, (err, content) => {
        if (err) {
          reject(err);
          return;
        }

        resolve(content!.toString());
      });
    });

    return new Date(JSON.parse(json).mtime);
  }

  async modified(filename: string): Promise<Date> {
    return this.#modified(filename);
  }
}
