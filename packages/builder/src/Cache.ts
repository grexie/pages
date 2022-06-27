import { FileSystem, Dirent } from './FileSystem';
import os from 'os';
import path from 'path';
import { createHash } from 'crypto';
import { createResolver, ResolvablePromise } from './utils/resolvable';

export interface ICache {
  lock<T = any>(
    filename: string | string[],
    cb: (cache: ICache) => Promise<T>
  ): Promise<T>;
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
  readonly #globalLock = new Mutex();

  constructor(fs: FileSystem, cacheDir: string = os.tmpdir()) {
    this.#fs = fs;
    this.#cacheDir = cacheDir;
  }

  #key(filename: string) {
    if (process.env.GREXIE_BUILDER_CACHE_HASH === 'false') {
      return path.resolve(this.#cacheDir, filename.substring(1));
    }
    const hash = createHash('sha1');
    hash.update(filename);
    const key = Array.from(hash.digest().toString('hex'));
    return `${path.resolve(
      this.#cacheDir,
      path.join(...key.slice(0, 5), key.slice(5).join(''))
    )}${path.extname(filename)}`;
  }

  async #lock<T = any>(
    filename: string | string[],
    cb: (cache: ICache) => Promise<T>,
    locked: Record<string, boolean> = {}
  ): Promise<T> {
    if (!Array.isArray(filename)) {
      filename = [filename];
    }

    const globalLock = await this.#globalLock.lock();

    const keys = filename
      .filter(filename => !locked[filename])
      .map(filename => ({ [filename]: this.#key(filename) }))
      .reduce((a, b) => ({ ...a, ...b }), {});

    const promises = Object.values(keys)
      .map(key => ({ [key]: this.#locks[key] }))
      .reduce((a, b) => ({ ...a, ...b }), {});

    const resolvers = Object.values(keys)
      .map(key => ({
        [key]: (this.#locks[key] = createResolver()),
      }))
      .reduce((a, b) => ({ ...a, ...b }), {});

    globalLock.unlock();
    await Promise.all(Object.values(promises));
    locked = Object.assign(
      {},
      locked,
      Object.keys(keys).reduce((a, b) => ({ ...a, [b]: true }), {})
    );

    const wrap = (
      cb: (filename: string, ...args: any[]) => Promise<any>
    ): any => {
      return async (filename: string, ...args: any[]): Promise<any> => {
        if (!locked[filename]) {
          throw new Error(`no lock for ${filename}`);
        }

        return cb(filename, ...args);
      };
    };

    const cache = {
      lock: (filename, cb) => this.#lock(filename, cb, locked),
      set: wrap(this.#set.bind(this)),
      get: wrap(this.#get.bind(this)),
      has: wrap(this.#has.bind(this)),
      remove: wrap(this.#remove.bind(this)),
      modified: wrap(this.#modified.bind(this)),
    } as ICache;

    try {
      return await cb(cache);
    } finally {
      Object.entries(resolvers).forEach(([key, resolver]) => {
        if (this.#locks[key] === resolver) {
          delete this.#locks[key];
        }
      });

      Object.values(resolvers).forEach(resolver => resolver.resolve());
    }
  }

  async lock<T = any>(
    filename: string | string[],
    cb: (cache: ICache) => Promise<T>
  ) {
    return this.#lock(filename, cb);
  }

  async #set(
    filename: string,
    content: Buffer | string,
    modified: Date | number = Date.now()
  ): Promise<void> {
    const key = this.#key(filename);

    await this.#fs.mkdir(path.dirname(key), { recursive: true });

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
    return this.lock(filename, () => this.#get(filename));
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
    return this.lock(filename, () => this.#has(filename));
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
    return this.lock(filename, () => this.#remove(filename));
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
    return this.lock(filename, () => this.#modified(filename));
  }

  async clean(): Promise<void> {
    const globalLock = await this.#globalLock.lock();
    await Promise.all(Object.values(this.#locks));

    try {
      await this.#fs.rm(this.#cacheDir, { recursive: true, force: true });
    } finally {
      globalLock.unlock();
    }
  }
}

class Lock {
  readonly #resolver: ResolvablePromise<void>;

  constructor(resolver: ResolvablePromise<void>) {
    this.#resolver = resolver;
  }

  unlock() {
    this.#resolver.resolve();
  }
}

class Mutex {
  #current = Promise.resolve();

  async lock() {
    const resolver = createResolver();

    const promise = this.#current;
    this.#current = resolver;
    try {
      await promise;
    } catch (err) {}

    return new Lock(resolver);
  }
}
