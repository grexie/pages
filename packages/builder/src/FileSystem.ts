import path from 'path';
import type { MakeDirectoryOptions } from 'fs';
import { Compiler } from 'webpack';
import { EventEmitter } from 'events';
import { createResolver } from '@grexie/pages/utils/resolvable';

interface ReadableFileSystemSync {
  readFileSync(filename: string): Buffer | string;
  readlinkSync(filename: string): Buffer | string;
  readdirSync(dirname: string): (Buffer | string)[] | Dirent[];
  statSync(filename: string): Stats;
  lstatSync(filename: string): Stats;
  realpathSync(filename: string): Buffer | string;
}

interface WritableFileSystemSync extends ReadableFileSystemSync {
  writeFileSync(filename: string, data: string | Buffer): void;
  mkdirSync(dirname: string): void;
  rmdirSync(dirname: string): void;
  unlinkSync(filename: string): void;
}

export type ReadableFileSystem = Compiler['inputFileSystem'] &
  ReadableFileSystemSync;
export type WritableFileSystem = ReadableFileSystem &
  Compiler['outputFileSystem'] &
  WritableFileSystemSync;

export interface Stats {
  isFile(): boolean;
  isDirectory(): boolean;
  isBlockDevice(): boolean;
  isCharacterDevice(): boolean;
  isSymbolicLink(): boolean;
  isFIFO(): boolean;
  isSocket(): boolean;
  readonly dev: number;
  readonly ino: number;
  readonly mode: number;
  readonly nlink: number;
  readonly uid: number;
  readonly gid: number;
  readonly rdev: number;
  readonly size: number | bigint;
  readonly blksize: number;
  readonly blocks: number;
  readonly atimeMs: number;
  readonly mtimeMs: number;
  readonly ctimeMs: number;
  readonly birthtimeMs: number;
  readonly atime: Date;
  readonly mtime: Date;
  readonly ctime: Date;
  readonly birthtime: Date;
}

export interface Dirent {
  isFile(): boolean;
  isDirectory(): boolean;
  isBlockDevice(): boolean;
  isCharacterDevice(): boolean;
  isSymbolicLink(): boolean;
  isFIFO(): boolean;
  isSocket(): boolean;
  name: string | Buffer;
}

// export interface WatchOptions {
//   aggregateTimeout?: number;
//   followSymlinks?: boolean;
//   ignored?: string | RegExp | string[];
//   poll?: number | boolean;
//   stdin?: boolean;
// }

// export interface FileSystemInfoEntry {
//   safeTime: number;
//   timestamp?: number;
// }

// export interface Watcher {
//   close: () => void;
//   pause: () => void;
//   getAggregatedChanges?: () => Set<string>;
//   getAggregatedRemovals?: () => Set<string>;
//   getFileTimeInfoEntries: () => Map<string, FileSystemInfoEntry | 'ignore'>;
//   getContextTimeInfoEntries: () => Map<string, FileSystemInfoEntry | 'ignore'>;
//   getInfo?: () => WatcherInfo;
// }

// export interface WatcherInfo {
//   changes: Set<string>;
//   removals: Set<string>;
//   fileTimeInfoEntries: Map<string, FileSystemInfoEntry | 'ignore'>;
//   contextTimeInfoEntries: Map<string, FileSystemInfoEntry | 'ignore'>;
// }

export interface FileSystemOptions<
  T extends ReadableFileSystem | WritableFileSystem = any
> {
  writable: boolean;
  path: string;
  fs: T;
}

export class FileSystem extends EventEmitter implements WritableFileSystem {
  readonly #fileSystems: FileSystemOptions[] = [];

  constructor() {
    super();
  }

  add(
    path: string,
    fs: ReadableFileSystem | (ReadableFileSystem & WritableFileSystem),
    writable: boolean = false
  ) {
    this.#fileSystems.push({
      writable,
      path,
      fs,
    });

    return this;
  }

  remove(path: string) {
    const index = this.#fileSystems.findIndex(fs => fs.path === path);

    if (index === -1) {
      throw new Error(`file system not found at ${path}`);
    }

    this.#fileSystems.splice(index, 1);
  }

  find(
    filename: string,
    writable: boolean = false
  ): (ReadableFileSystem | (ReadableFileSystem & WritableFileSystem))[] {
    let fileSystems = this.#fileSystems;

    if (writable) {
      fileSystems = fileSystems.filter(({ writable }) => writable);
    }

    fileSystems = fileSystems.filter(({ path }) => filename.startsWith(path));
    fileSystems.sort((a, b) => b.path.length - a.path.length);

    return fileSystems.map(({ fs }) => fs);
  }

  async #call<E, P extends any[], T>(
    name: string,
    writable: boolean,
    callback: ((err: E, ...args: P) => void) | undefined,
    args: any[],
    handler: (...args: P) => T
  ): Promise<T> {
    const filename = args[0] as string;
    const fileSystems = this.find(filename, writable) as (ReadableFileSystem &
      WritableFileSystem)[];

    let err = undefined as unknown as E;
    let value = [] as unknown as P;

    if (fileSystems.length === 0) {
      if (callback) {
        callback(
          new Error('no filesystems') as unknown as E,
          ...([] as unknown as P)
        );
        return undefined as any;
      } else {
        return Promise.reject(new Error('no filesystems'));
      }
    }

    for (const fs of fileSystems) {
      try {
        value = await new Promise<P>((resolve, reject) => {
          try {
            (fs as any)[name](...args, (err: E, ...value: P) => {
              if (err) {
                reject(err);
                return;
              }

              resolve(value);
            });
          } catch (err) {
            reject(err);
          }
        });
        break;
      } catch (_err) {
        err = _err as E;
      }
    }

    if (writable) {
      this.emit(`write:${filename}`);
    }

    if (err) {
      if (callback) {
        callback(err, ...([] as unknown as P));
        return undefined as unknown as T;
      } else {
        return Promise.reject(err);
      }
    }

    if (callback) {
      callback(err as unknown as E, ...(value as unknown as P));
      return undefined as unknown as T;
    } else {
      return handler(...(value as unknown as P));
    }
  }

  #callSync<T>(name: string, writable: boolean, args: any[]): T {
    const filename = args[0] as string;
    const fileSystems = this.find(filename, writable) as (ReadableFileSystem &
      WritableFileSystem)[];

    let err = undefined as any;
    let value = undefined as any;

    if (fileSystems.length === 0) {
      throw new Error('no filesystems');
    }

    for (const fs of fileSystems) {
      try {
        value = (fs as any)[name](...args);

        break;
      } catch (_err) {
        err = _err;
      }
    }

    if (writable) {
      this.emit(`write:${filename}`);
    }

    if (err) {
      throw err;
    }

    return value;
  }

  readFile(filename: string): Promise<Buffer | string>;
  readFile(
    filename: string,
    callback: (
      err: null | NodeJS.ErrnoException,
      data?: string | Buffer
    ) => void
  ): void;
  readFile(
    filename: string,
    callback?: (
      err: null | NodeJS.ErrnoException,
      data?: string | Buffer
    ) => void
  ) {
    return this.#call('readFile', false, callback, [filename], data => data);
  }
  readFileSync(filename: string): Buffer | string {
    return this.#callSync('readFileSync', false, [filename]);
  }

  readlink(filename: string): Promise<string | Buffer>;
  readlink(
    filename: string,
    callback: (
      err: null | NodeJS.ErrnoException,
      link?: string | Buffer
    ) => void
  ): void;
  readlink(
    filename: string,
    callback?: (
      err: null | NodeJS.ErrnoException,
      link?: string | Buffer
    ) => void
  ) {
    return this.#call('readlink', false, callback, [filename], link => link);
  }
  readlinkSync(filename: string): string | Buffer {
    return this.#callSync('readlinkSync', false, [filename]);
  }

  readdir(dirname: string): Promise<(string | Buffer)[] | Dirent[]>;
  readdir(
    dirname: string,
    callback: (
      err: null | NodeJS.ErrnoException,
      dirents?: (string | Buffer)[] | Dirent[]
    ) => void
  ): void;
  readdir(
    dirname: string,
    callback?: (
      err: null | NodeJS.ErrnoException,
      dirents?: (string | Buffer)[] | Dirent[]
    ) => void
  ) {
    return this.#call(
      'readdir',
      false,
      callback,
      [dirname],
      dirents => dirents
    );
  }
  readdirSync(dirname: string): (string | Buffer)[] | Dirent[] {
    return this.#callSync('readdirSync', false, [dirname]);
  }

  stat(filename: string): Promise<Stats>;
  stat(
    filename: string,
    callback: (err: null | NodeJS.ErrnoException, stats?: Stats) => void
  ): void;
  stat(
    filename: string,
    callback?: (err: null | NodeJS.ErrnoException, stats?: Stats) => void
  ) {
    return this.#call('stat', false, callback, [filename], stats => stats);
  }
  statSync(filename: string): Stats {
    return this.#callSync('statSync', false, [filename]);
  }

  lstat(filename: string): Promise<Stats>;
  lstat(
    filename: string,
    callback: (err: null | NodeJS.ErrnoException, stats?: Stats) => void
  ): void;
  lstat(
    filename: string,
    callback?: (err: null | NodeJS.ErrnoException, stats?: Stats) => void
  ) {
    return this.#call('lstat', false, callback, [filename], stats => stats);
  }
  lstatSync(filename: string): Stats {
    return this.#callSync('lstatSync', false, [filename]);
  }

  realpath(filename: string): Promise<string>;
  realpath(
    filename: string,
    callback: (
      err: null | NodeJS.ErrnoException,
      filename?: string | Buffer
    ) => void
  ): void;
  realpath(
    filename: string,
    callback?: (
      err: null | NodeJS.ErrnoException,
      filename?: string | Buffer
    ) => void
  ) {
    return this.#call(
      'realpath',
      false,
      callback,
      [filename],
      filename => filename
    );
  }
  realpathSync(filename: string): string {
    return this.#callSync('realpathSync', false, [filename]);
  }

  writeFile(filename: string, data: string | Buffer): Promise<void>;
  writeFile(
    filename: string,
    data: string | Buffer,
    callback: (err: null | NodeJS.ErrnoException) => void
  ): void;
  writeFile(
    filename: string,
    data: string | Buffer,
    callback?: (err: null | NodeJS.ErrnoException) => void
  ) {
    return this.#call(
      'writeFile',
      true,
      callback,
      [filename, data],
      () => undefined
    );
  }
  writeFileSync(filename: string, data: string | Buffer): void {
    return this.#callSync('writeFileSync', true, [filename, data]);
  }

  mkdir(dirname: string): Promise<void>;
  mkdir(dirname: string, options: { recursive?: boolean }): Promise<void>;
  mkdir(
    dirname: string,
    callback: (err: null | NodeJS.ErrnoException) => void
  ): void;
  mkdir(
    dirname: string,
    options: { recursive?: boolean },
    callback: (err: null | NodeJS.ErrnoException) => void
  ): void;
  mkdir(dirname: string, ...args: any[]) {
    const callback =
      typeof args[args.length - 1] === 'function' ? args.pop() : undefined;
    const [options] = args;

    if (options?.recursive) {
      const fs = this.#fileSystems.find(
        ({ fs }) => fs === this.find(dirname, true)[0]
      );

      const resolver = createResolver<void>();
      const fsCheck = () =>
        resolver.reject(
          new Error(
            `target filesystem is not rooted at directory to create recursively ${dirs.join(
              path.delimiter
            )}`
          )
        );
      if (!fs) {
        fsCheck();
        return resolver;
      }

      const toCreate: string[] = [];
      const dirs: string[] = dirname.split(path.delimiter);

      const nextStat = (err?: any, stats?: Stats) => {
        if (err) {
          toCreate.unshift(dirs.pop()!);
        } else if (!stats!.isDirectory()) {
          resolver.reject(
            new Error(`${dirs.join(path.delimiter)} is not a directory`)
          );
          return;
        } else {
          if (!dirs.join(path.delimiter).startsWith(fs?.path!)) {
            fsCheck();
            return;
          }

          next();
        }

        if (dirs.length) {
          try {
            this.stat(dirs.join(path.delimiter), nextStat);
          } catch (err) {
            nextStat(err);
          }
        }
      };

      const next = (err?: any) => {
        if (toCreate.length) {
          const dir = [...dirs, toCreate[0]].join(path.delimiter);
          dirs.push(toCreate.shift()!);
          this.#call('mkdir', true, next, [dir], () => {});
        } else {
          resolver.resolve();
        }
      };

      const promise = resolver.then(
        () => {
          if (callback) {
            callback(null);
          }
        },
        err => {
          if (callback) {
            callback(null, err);
          } else {
            throw err;
          }
        }
      );
      if (!callback) {
        return promise;
      }
    } else {
      return this.#call(
        'mkdir',
        true,
        callback,
        [dirname, ...args],
        () => undefined
      );
    }
  }
  mkdirSync(dirname: string, options?: { recursive?: boolean }): void {
    if (options?.recursive) {
      const fs = this.#fileSystems.find(
        ({ fs }) => fs === this.find(dirname, true)[0]
      );
      const fsCheck = () => {
        throw new Error(
          `target filesystem is not rooted at directory to create recursively ${dirs.join(
            path.delimiter
          )}`
        );
      };
      if (!fs) {
        fsCheck();
      }

      const toCreate: string[] = [];
      const dirs: string[] = dirname.split(path.delimiter);
      dirs.pop();

      while (dirs.length) {
        try {
          const stats = this.statSync(dirs.join(path.delimiter));
          if (!stats.isDirectory()) {
            throw new Error(`${dirs.join(path.delimiter)} is not a directory`);
          }
          break;
        } catch (err) {
          toCreate.unshift(dirs.pop()!);
        }
      }

      if (!dirs.join(path.delimiter).startsWith(fs!.path)) {
        fsCheck();
      }

      while (toCreate.length > 1) {
        const dir = [...dirs, toCreate[0]].join(path.delimiter);
        this.#callSync('mkdirSync', true, [dir]);
        dirs.push(toCreate.shift()!);
      }
    }

    this.#callSync('mkdirSync', true, [dirname]);
  }

  rmdir(dirname: string): Promise<void>;
  rmdir(
    dirname: string,
    callback: (err: null | NodeJS.ErrnoException) => void
  ): void;
  rmdir(
    dirname: string,
    callback?: (err: null | NodeJS.ErrnoException) => void
  ) {
    return this.#call('mkdir', true, callback, [dirname], () => undefined);
  }
  rmdirSync(dirname: string): void {
    return this.#callSync('rmdirSync', true, [dirname]);
  }

  unlink(filename: string): Promise<void>;
  unlink(
    filename: string,
    callback: (err: null | NodeJS.ErrnoException) => void
  ): void;
  unlink(
    filename: string,
    callback?: (err: null | NodeJS.ErrnoException) => void
  ) {
    return this.#call('unlink', true, callback, [filename], () => undefined);
  }
  unlinkSync(filename: string): void {
    return this.#callSync('unlinkSync', true, [filename]);
  }

  join(...paths: string[]) {
    return path.join(...paths);
  }
  relative(from: string, to: string) {
    return path.relative(from, to);
  }
  dirname(filename: string) {
    return path.dirname(filename);
  }
}
