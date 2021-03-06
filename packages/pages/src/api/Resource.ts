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

  serialize({ serializeMetadata }: ResourceSerializeOptions) {
    return `{
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

export interface ModuleResourceOptions<
  X = any,
  M extends ResourceMetadata = any
> extends ResourceOptions<M> {
  source: string;
  exports: X;
}

export class ModuleResource<
  X = any,
  M extends ResourceMetadata = any
> extends Resource<M> {
  readonly #source: string;
  readonly exports: X;

  constructor({ source, exports, ...options }: ModuleResourceOptions<X, M>) {
    super(options);
    this.#source = source;
    this.exports = exports;
  }

  serialize({ serializeMetadata }: ResourceSerializeOptions): string {
    const source = `(() => {
      var module = { exports: {} };
      ((exports, module) => {
        ${this.#source}
      })(module.exports, module);
      return module.exports;
    })()`;

    return `{
      path: ${JSON.stringify(this.path)},
      slug: ${JSON.stringify(this.slug)},
      metadata: ${serializeMetadata(JSON.stringify(this.metadata, null, 2))},
      exports: ${source},
    }`;
  }
}
