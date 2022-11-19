import type {
  ContentResource,
  Resource,
  ResourceMetadata,
} from '@grexie/pages/api';
import path from 'path';
import EventEmitter from 'events';
import type { BuildContext } from './BuildContext.js';

export interface SourceOptions {
  filename: string;
  path: string[];
}

export class Source extends EventEmitter {
  readonly context: BuildContext;
  readonly filename: string;
  readonly #path: string[];

  constructor({ context, filename, path }: SourceOptions) {
    super();
    this.context = context;
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

  get abspath() {
    if (!(this.filename.startsWith('./') || this.filename.startsWith('../'))) {
      return this.filename;
    } else {
      return path.resolve(this.context.rootDir, this.filename);
    }
  }

  relpath(from: string) {
    if (!(this.filename.startsWith('./') || this.filename.startsWith('../'))) {
      return this.filename;
    } else {
      let relpath = path.relative(from, this.abspath);
      if (!relpath.startsWith('../')) {
        relpath = `./${relpath}`;
      }
      return relpath;
    }
  }

  get dirname() {
    return path.dirname(this.abspath);
  }
}
