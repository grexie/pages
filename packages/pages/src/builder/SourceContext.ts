import {
  ContentResource,
  ModuleResource,
  Resource,
  Source,
  SourceOptions,
} from '../api';
import type { BuildContext, ModuleFactory, Module } from '../builder';
import { Config } from './ConfigContext';

export interface CreateContentOptions<C = any> {
  content: C;
}

export type SourceCompiler = (source: string) => string;

export interface SourceContextOptions extends SourceOptions {
  context: BuildContext;
  factory: ModuleFactory;
  module: Module;
  content: Buffer;
  config: Config;
}

export class SourceContext extends Source {
  readonly context: BuildContext;
  readonly factory: ModuleFactory;
  readonly module: Module;
  readonly content: Buffer;
  readonly config: Config;

  #index = 0;

  constructor({
    context,
    factory,
    module,
    content,
    config,
    ...options
  }: SourceContextOptions) {
    super(options);
    this.context = context;
    this.factory = factory;
    this.module = module;
    this.content = content;
    this.config = config;
  }

  get metadata() {
    return this.config.metadata;
  }

  create() {
    return new Resource({
      path: this.path,
      metadata: this.metadata,
    });
  }

  createContent<C = void>({ content }: CreateContentOptions<C>) {
    return new ContentResource({
      path: this.path,
      content,
      metadata: this.metadata,
    });
  }

  createFromSource() {
    return this.createContent({ content: this.content });
  }

  async createModule({ source }: { source: string }) {
    if (!this.module.module) {
      throw new Error('state error: source module not loaded');
    }

    const module = await this.context.modules.create(
      this.factory,
      this.module.webpackModule,
      `${this.filename}$${++this.#index}`,
      source,
      this.filename
    );

    this.once('end', () =>
      this.context.modules.evict(this.factory, module.filename, {
        recompile: true,
      })
    );

    const { exports } = module.load(this.module.module);

    return new ModuleResource({
      context: this,
      path: this.path,
      metadata: this.metadata,
      source: module.source,
      exports,
    });
  }
}
