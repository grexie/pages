import { Compiler, ContextExclusionPlugin } from 'webpack';
import { EventEmitter } from 'events';
import fs from 'fs';
import { resolve, relative } from 'path';
import { promisify } from 'util';

const exists = promisify(fs.exists);
const readFile = promisify(fs.readFile);
const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);

interface WebpackStats {
  isFile: () => boolean;
  isDirectory: () => boolean;
  isBlockDevice: () => boolean;
  isCharacterDevice: () => boolean;
  isSymbolicLink: () => boolean;
  isFIFO: () => boolean;
  isSocket: () => boolean;
  dev: number | bigint;
  ino: number | bigint;
  mode: number | bigint;
  nlink: number | bigint;
  uid: number | bigint;
  gid: number | bigint;
  rdev: number | bigint;
  size: number | bigint;
  blksize: number | bigint;
  blocks: number | bigint;
  atimeMs: number | bigint;
  mtimeMs: number | bigint;
  ctimeMs: number | bigint;
  birthtimeMs: number | bigint;
  atime: Date;
  mtime: Date;
  ctime: Date;
  birthtime: Date;
}

interface StatsOptions {
  isFile?: boolean;
  isDirectory?: boolean;
  size?: number | bigint;
}

type WebpackInputFileSystem = Compiler['inputFileSystem'];
type WebpackOutputFileSystem = Compiler['outputFileSystem'];
type WebpackFileSystem = WebpackInputFileSystem & WebpackOutputFileSystem;

export enum FileType {
  file,
  directory,
}

export interface File {
  type?: FileType;
  path: string;
  data?: Buffer;
}

export interface MountOptions {
  path: string;
  readonly: boolean;
}

export interface StoreOptions {
  files?: File[];
  mounts?: MountOptions[];
}

class Stats implements WebpackStats {
  readonly #isFile: boolean;
  readonly #isDirectory: boolean;

  readonly isFile = () => this.#isFile;
  readonly isDirectory = () => this.#isDirectory;
  readonly isBlockDevice = () => false;
  readonly isCharacterDevice = () => false;
  readonly isSymbolicLink = () => false;
  readonly isFIFO = () => false;
  readonly isSocket = () => false;
  readonly dev = 0;
  readonly ino = 0;
  readonly mode = 0;
  readonly nlink = 0;
  readonly uid = 0;
  readonly gid = 0;
  readonly rdev = 0;
  readonly size: number | bigint;
  readonly blksize = 0;
  readonly blocks = 0;
  readonly atimeMs = 0;
  readonly mtimeMs = 0;
  readonly ctimeMs = 0;
  readonly birthtimeMs = 0;
  readonly atime = new Date(0);
  readonly mtime = new Date(0);
  readonly ctime = new Date(0);
  readonly birthtime = new Date(0);

  constructor({ isFile = false, isDirectory = false, size = 0 }: StatsOptions) {
    this.#isFile = isFile;
    this.#isDirectory = isDirectory;
    this.size = size;
  }
}

export class Mount {
  readonly path: string;
  readonly readonly: boolean;

  constructor({ path, readonly }: MountOptions) {
    this.path = path;
    this.readonly = readonly;
  }

  #resolve(path: string) {
    return resolve(this.path, path);
  }

  async readFile(path: string): Promise<Buffer> {
    path = this.#resolve(path);

    if (!(await exists(path))) {
      throw new Error('not found');
    }

    return readFile(path);
  }

  async stat(path: string): Promise<Stats> {
    path = this.#resolve(path);

    if (!(await exists(path))) {
      throw new Error('not found');
    }

    const stats = await stat(path);

    return new Stats({
      isFile: stats.isFile(),
      isDirectory: stats.isDirectory(),
      size: stats.size,
    });
  }

  async readdir(path: string): Promise<string[]> {
    path = this.#resolve(path);

    if (!(await exists(path))) {
      throw new Error('not found');
    }

    return await readdir(path);
  }
}

export class MountSet extends Map<string, Mount> implements WebpackFileSystem {
  #proxy =
    (name: string) =>
    (path: string, ...args: any[]) => {
      const callback = args.pop();
      const mounts = this.entries();

      const next = () => {
        const result = mounts.next();
        if (result.done) {
          callback(new Error('not found'));
          return;
        }

        const [prefix, mount] = result.value as [string, any];

        if (path.startsWith(prefix)) {
          mount[name](path, ...args).then(
            (value: any) => callback(null, value),
            () => next()
          );
        } else {
          next();
        }
      };

      next();
    };

  mkdir = () => {
    throw new Error('not implemented');
  };
  readFile = this.#proxy('readFile');
  writeFile = () => {
    throw new Error('not implemented');
  };
  stat = this.#proxy('stat');
  readdir = this.#proxy('readdir');
  readlink(
    path: string,
    callback: (err: Error | null, data: undefined) => void
  ) {
    callback(null, undefined);
  }
}

export class Store extends EventEmitter implements WebpackFileSystem {
  readonly files: File[];
  readonly mounts: MountSet = new MountSet();

  constructor({ files = [], mounts = [] }: StoreOptions = {}) {
    super();
    this.files = files.map(file =>
      Object.assign(file, { type: file.type ?? FileType.file })
    );
    mounts.forEach(mount => {
      this.mounts.set(mount.path, new Mount(mount));
    });
  }

  mkdir(path: string, callback: (err: Error | null) => void) {
    this.files.push({
      type: FileType.directory,
      path,
    });
    this.emit('mkdir', path);
    this.emit(`mkdir:${path}`, path);
    callback(null);
  }

  readFile(path: string, callback: (err: Error | null, data?: Buffer) => void) {
    const file = this.files.find(file => file.path === path);

    if (!file) {
      this.mounts.readFile(path, callback);
      return;
    }

    if (file.type === FileType.directory) {
      callback(new Error('attempted read of directory'));
      return;
    }

    callback(null, file.data);
  }

  stat(
    path: string,
    callback: (err: Error | null, stat?: WebpackStats) => void
  ) {
    const file = this.files.find(file => file.path === path);

    if (!file) {
      this.mounts.stat(path, callback);
      return;
    }

    if (file!.type === FileType.directory) {
      callback(
        null,
        new Stats({
          isDirectory: true,
        })
      );
      return;
    }

    callback(
      null,
      new Stats({
        isFile: true,
        size: file!.data!.length,
      })
    );
  }

  writeFile(
    path: string,
    data: string | Buffer,
    callback: (err: Error | null) => void
  ) {
    let index = this.files.findIndex(file => file.path === path);

    if (index === -1) {
      index = this.files.length;
    }

    this.files.splice(index, 0, {
      type: FileType.file,
      path,
      data: Buffer.from(data),
    });
    this.emit('write', path);
    this.emit(`write:${path}`);
    callback(null);
  }
  readdir(
    path: string,
    callback: (err: Error | null, files: string[]) => void
  ) {
    this.mounts.readdir(path, callback);
  }
  readlink(
    path: string,
    callback: (err: Error | null, data: undefined) => void
  ) {
    callback(null, undefined);
  }
  realpath(path: string, callback: (err: Error | null, path?: string) => void) {
    callback(null, path);
  }
  lstat(
    path: string,
    callback: (err: Error | null, stats?: WebpackStats) => void
  ) {
    this.stat(path, callback);
  }
}
