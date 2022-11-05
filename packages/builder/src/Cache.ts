import { FileSystem } from './FileSystem.js';
import path from 'path';
import { createHash } from 'crypto';
import { KeyedMutex, Mutex } from './utils/mutex.js';

export enum CacheType {
  inherit,
  ephemeral,
  persistent,
}

export interface ICache {
  lock<T = any>(
    filename: string | string[],
    cb: (cache: ICache) => Promise<T>,
    fail?: boolean
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
  create: (name: string, storage?: CacheType) => ICache;
}

export interface CacheStorage {
  ephemeral: FileSystem;
  persistent: FileSystem;
}

export interface CacheOptions {
  storage: CacheStorage;
  cacheDir: string;
  cacheType?: Omit<CacheType, CacheType.inherit>;
  parent?: Cache;
}

export class Cache implements ICache {
  protected readonly storage: CacheStorage;
  protected readonly cacheDir: string;
  protected readonly cacheType: Omit<CacheType, CacheType.inherit>;
  readonly #fs: FileSystem;
  readonly #locks: KeyedMutex;

  constructor({
    storage,
    cacheDir,
    cacheType = CacheType.ephemeral,
    parent,
  }: CacheOptions) {
    this.storage = storage;
    this.cacheDir = cacheDir;
    this.cacheType = cacheType;
    if (cacheType === CacheType.ephemeral) {
      this.#fs = this.storage.ephemeral;
    } else if (cacheType === CacheType.persistent) {
      this.#fs = this.storage.persistent;
    } else {
      throw new TypeError('invalid cache type');
    }
    if (parent) {
      this.#locks = parent.#locks;
    } else {
      this.#locks = new KeyedMutex();
    }
  }

  create(name: string, cacheType: CacheType = CacheType.inherit) {
    return new Cache({
      storage: this.storage,
      cacheDir: path.resolve(this.cacheDir, name),
      cacheType: cacheType === CacheType.inherit ? this.cacheType : cacheType,
      parent: this,
    });
  }

  #key(filename: string) {
    if (process.env.GREXIE_BUILDER_CACHE_HASH === 'false') {
      return path.resolve(this.cacheDir, filename.substring(1));
    }
    const hash = createHash('sha1');
    hash.update(path.resolve(this.cacheDir, filename.substring(1)));
    const key = Array.from(hash.digest().toString('hex'));
    return `${path.resolve(
      this.cacheDir,
      path.join(...key.slice(0, 5), key.slice(5).join(''))
    )}${path.extname(filename)}`;
  }

  async #lock<T = any>(
    filename: string | string[],
    cb: (cache: ICache) => Promise<T>,
    fail: boolean = false,
    locked: Set<string> = new Set()
  ): Promise<T> {
    if (!Array.isArray(filename)) {
      filename = [filename];
    }

    const keys = filename
      .filter(filename => !locked.has(filename))
      .map(filename => ({ [filename]: this.#key(filename) }))
      .reduce((a, b) => ({ ...a, ...b }), {});

    const lock = await this.#locks.lock(Object.values(keys), fail);
    const cache = new LockedCache({
      locked: filename,
      storage: this.storage,
      cacheDir: this.cacheDir,
      cacheType: this.cacheType,
      parent: this,
    });

    try {
      return await cb(cache);
    } finally {
      lock.unlock();
    }
  }

  async lock<T = any>(
    filename: string | string[],
    cb: (cache: ICache) => Promise<T>,
    fail: boolean = false
  ) {
    return this.#lock(filename, cb, fail);
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
    const lock = await this.#locks.lockGlobal();

    const promises: Promise<any>[] = [];
    promises.push(
      this.storage.ephemeral.rm(this.cacheDir, {
        recursive: true,
        force: true,
      })
    );
    if (this.storage.ephemeral !== this.storage.persistent) {
      promises.push(
        this.storage.persistent.rm(this.cacheDir, {
          recursive: true,
          force: true,
        })
      );
    }

    try {
      await Promise.all(promises);
    } finally {
      lock.unlock();
    }
  }
}

interface LockedCacheOptions extends CacheOptions {
  locked: string[];
}

class LockedCache extends Cache {
  readonly #locked: Set<string>;

  constructor({ locked, ...options }: LockedCacheOptions) {
    super(options);
    this.#locked = new Set(locked);
  }

  async lock<T = any>(
    filename: string | string[],
    cb: (cache: ICache) => Promise<T>,
    fail?: boolean
  ): Promise<T> {
    if (typeof filename === 'string') {
      filename = [filename];
    }

    if (!filename.length) {
      return super.lock(filename, cb, fail);
    }

    let notLocked: string[] = [];
    for (const f of filename) {
      if (!this.#locked.has(f)) {
        notLocked.push(f);
      }
    }

    return super.lock(
      notLocked,
      () => {
        const cache = new LockedCache({
          locked: filename as string[],
          storage: this.storage,
          cacheDir: this.cacheDir,
          cacheType: this.cacheType,
          parent: this,
        });
        return cb(cache);
      },
      fail
    );
  }
}
