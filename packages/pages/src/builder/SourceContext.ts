import {
  CreateOptions,
  ModuleResource,
  ResourceMetadata,
  Source,
  SourceOptions,
} from '../api';
import type { BuildContext, ModuleResolver, Module } from '../builder';

export type SourceCompiler = (source: string) => string;

export interface SourceContextOptions extends SourceOptions {
  context: BuildContext;
  resolver: ModuleResolver;
  module: Module;
  content: Buffer;
}

export class SourceContext extends Source {
  readonly context: BuildContext;
  readonly resolver: ModuleResolver;
  readonly module: Module;
  readonly content: Buffer;

  #index = 0;

  constructor({
    context,
    resolver,
    module,
    content,
    ...options
  }: SourceContextOptions) {
    super(options);
    this.context = context;
    this.resolver = resolver;
    this.module = module;
    this.content = content;
  }

  createBuffer<M extends ResourceMetadata = any>({
    metadata,
  }: Omit<CreateOptions<Buffer, M>, 'content'> = {}) {
    return super.create({ content: this.content, metadata });
  }

  async createModule<X = any, M extends ResourceMetadata = any>({
    source,
    metadata,
  }: Omit<CreateOptions<X, M>, 'content'> & { source: string }) {
    if (!this.module.module) {
      throw new Error('state error: source module not loaded');
    }

    const module = await this.context.modules.create(
      this.resolver,
      this.dirname,
      `${this.filename}$${++this.#index}`,
      source,
      this.filename
    );

    this.once('end', () => this.context.modules.evict(module.filename));

    const { exports } = module.load(this.module.module);

    return new ModuleResource({
      context: this,
      path: this.path,
      metadata: metadata ?? {},
      source: module.source,
      exports,
    });
  }
}
