import { ContentResource, ResourceMetadata } from './Resource';
import { dirname } from 'path';
export type SourceTree = { [key: string]: SourceTree | string };

export interface SourceOptions {
  filename: string;
  path: string[];
}

export interface CreateOptions<C = any, M extends ResourceMetadata = any> {
  content: C;
  metadata?: M;
}

export class Source {
  readonly filename: string;
  readonly path: string[];
  readonly slug: string;

  constructor({ filename, path }: SourceOptions) {
    this.filename = filename;
    this.path = path;
    this.slug = path.join('/');
  }

  get dirname() {
    return dirname(this.filename);
  }

  create<C = any, M extends ResourceMetadata = any>({
    content,
    metadata,
  }: CreateOptions<C, M>) {
    return new ContentResource({
      path: this.path,
      content,
      metadata: metadata ?? {},
    });
  }
}
