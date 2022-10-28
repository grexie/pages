export type ResourceMetadata = Record<string, any> & { type?: string };

export interface ResourceSerializeOptions {
  serializeMetadata: (source: string) => string;
}

export interface ResourceOptions<M extends ResourceMetadata = any> {
  path: string[];
  metadata: M;
}

export class Resource<M extends ResourceMetadata = any> {
  readonly path: string[];
  readonly slug: string;
  readonly metadata: M;

  constructor({ path, metadata }: ResourceOptions<M>) {
    this.path = path;
    this.slug = path.join('/');
    this.metadata = metadata;
  }

  async serialize({ serializeMetadata }: ResourceSerializeOptions) {
    return `export const resource = {
      path: ${JSON.stringify(this.path)},
      slug: ${JSON.stringify(this.slug)},
      metadata: ${serializeMetadata(JSON.stringify(this.metadata, null, 2))},
    }`;
  }

  toJSON() {
    return { path: this.path, slug: this.slug, metadata: this.metadata };
  }
}

export class ContentResource<
  C = any,
  M extends ResourceMetadata = any
> extends Resource<M> {
  readonly content: C;

  constructor({ content, ...options }: ResourceOptions<M> & { content: C }) {
    super(options);
    this.content = content;
  }
}
