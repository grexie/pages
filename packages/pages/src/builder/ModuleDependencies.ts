import { ICache } from '@grexie/builder/Cache.js';
import type { ReadableFileSystem } from '@grexie/builder/FileSystem.js';
import { ModuleReference } from './ModuleLoader.js';

export interface ModuleDependenciesOptions {
  cache: ICache;
  fs: ReadableFileSystem;
}

export interface ModuleDependencyEntry {
  filename: string;
  remove(): Promise<void>;
  dependencies(): Promise<ModuleReference[]>;
}

export class ModuleDependencies {
  readonly #cache: ICache;
  readonly #fs: ReadableFileSystem;

  constructor({ cache, fs }: ModuleDependenciesOptions) {
    this.#cache = cache;
    this.#fs = fs;
  }

  async set(
    filename: string,
    ...dependencies: ModuleReference[]
  ): Promise<void> {
    throw new Error('not implemented');
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<ModuleDependencyEntry> {
    throw new Error('not implemented');
  }

  async shouldRebuild(filename: string): Promise<boolean> {
    throw new Error('not implemented');
  }
}
