import type {
  ContentResource,
  Resource,
  ResourceMetadata,
} from '@grexie/pages/api';
import path from 'path';
import EventEmitter from 'events';
export type SourceTree = { [key: string]: SourceTree | string };

export interface SourceOptions {
  filename: string;
  path: string[];
}

export class Source extends EventEmitter {
  readonly filename: string;
  readonly #path: string[];

  constructor({ filename, path }: SourceOptions) {
    super();
    this.filename = filename;
    this.#path = path;
  }

  get isPagesConfig() {
    const lastPath = this.#path[this.#path.length - 1];
    return (
      ['.yml', '.yaml', '.json'].includes(path.extname(this.filename)) &&
      ['.pages', 'pages'].includes(path.extname(lastPath) || lastPath)
    );
  }

  get path() {
    if (!this.isPagesConfig) {
      return this.#path;
    }

    const _path = this.#path.slice();
    const lastPath = _path.pop()!.replace(/(^\.?|\.)pages$/, '');
    if (lastPath && lastPath !== 'index') {
      _path.push(lastPath);
    }
    return _path;
  }

  get slug() {
    return this.path.join('/');
  }

  get dirname() {
    return path.dirname(this.filename);
  }
}
