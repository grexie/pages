export type ResourceMetadata = Record<string, any> & { type?: string };

export interface ResourceSerializeOptions {
  serializeMetadata: (source: string) => string;
  imports: boolean;
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

  async serialize({
    serializeMetadata,
    imports,
  }: ResourceSerializeOptions): Promise<{
    code: string;
    map?: any;
  }> {
    if (imports) {
      return { code: '' };
    } else {
      return {
        code: `export const resource = {
        path: ${JSON.stringify(this.path)},
        slug: ${JSON.stringify(this.slug)},
        metadata: ${serializeMetadata(JSON.stringify(this.metadata, null, 2))},
      }`,
      };
    }
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

export const ResourceContextSet = Symbol();

export class ResourceContext {
  readonly parent?: ResourceContext;
  readonly #children: ResourceContext[] = [];
  #resource?: Resource;

  constructor(parent?: ResourceContext) {
    this.parent = parent;
    if (parent) {
      parent.#children.push(this);
    }
  }

  get root() {
    let self: ResourceContext = this;
    while (self.parent) {
      self = self.parent;
    }
    return self;
  }

  get children() {
    return this.#children.slice();
  }

  get resource() {
    return this.#resource!;
  }

  get resources() {
    const stack: ResourceContext[] = [this];
    let el: ResourceContext | undefined;
    const out: Resource[] = [];
    while ((el = stack.shift())) {
      if (el.resource) {
        out.push(el.resource);
      }
      stack.push(...el.#children);
    }
    return out;
  }

  [ResourceContextSet](resource: Resource) {
    this.#resource = resource;
  }
}
