import { Config } from './Config.js';

export type ResourceMetadata = Record<string, any> & { type?: string };

export interface ResourceSerializeOptions {
  serializeConfig: (source: string) => string;
  imports: boolean;
}

export interface ResourceOptions<
  M extends ResourceMetadata = any,
  C extends Config<M> = any
> {
  path: string[];
  config: C;
}

export class Resource<
  M extends ResourceMetadata = any,
  C extends Config<M> = any
> {
  readonly path: string[];
  readonly slug: string;
  readonly config: C;

  constructor({ path, config }: ResourceOptions<M>) {
    this.path = path;
    this.slug = path.join('/');
    this.config = config;
  }

  async serialize({
    serializeConfig,
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
        config: ${serializeConfig(JSON.stringify(this.config, null, 2))}
      }`,
      };
    }
  }

  toJSON() {
    return { path: this.path, slug: this.slug, config: this.config };
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

export interface ModuleResource<X = any, M extends ResourceMetadata = any>
  extends Resource<M> {
  readonly exports: X;
}
