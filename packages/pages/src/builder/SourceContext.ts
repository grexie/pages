import { Source, SourceOptions } from '../api/Source.js';
import { ContentResource, Resource } from '../api/Resource.js';
import type { BuildContext } from '../builder/BuildContext.js';
import type { ModuleFactory, Module } from '../builder/ModuleContext.js';
import { ModuleResource } from './ModuleResource.js';
import { Config, ConfigModule } from './ConfigContext.js';
import path from 'path';
import { ObjectProxy } from '../utils/proxy.js';

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
  configModule: ConfigModule;
}

export class SourceContext extends Source {
  readonly context: BuildContext;
  readonly factory: ModuleFactory;
  readonly module: Module;
  readonly content: Buffer;
  readonly config: Config;
  readonly configModule: ConfigModule;

  #index = 0;

  constructor({
    context,
    factory,
    module,
    content,
    config,
    configModule,
    ...options
  }: SourceContextOptions) {
    super(options);
    this.context = context;
    this.factory = factory;
    this.module = module;
    this.content = content;
    this.config = config;
    this.configModule = configModule;
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

  async createModule({
    source,
    esm = false,
  }: {
    source: string;
    esm?: boolean;
  }) {
    if (!this.module.module) {
      throw new Error('state error: source module not loaded');
    }

    const module = await this.context.modules.create(
      this.factory,
      this.module.webpackModule,
      `${this.filename}$${++this.#index}`,
      source,
      this.filename,
      {
        filename: this.filename,
        compile: true,
        esm,
      }
    );

    this.once('end', () =>
      this.context.modules.evict(this.factory, module.filename, {
        recompile: true,
        fail: false,
      })
    );

    await module.load();

    const { exports } = this.module;

    return new ModuleResource({
      path: this.path,
      metadata: this.metadata,
      source,
      exports,
    });
  }

  async serialize(resource: Resource) {
    const serializeMetadata = (source: string) =>
      `__pages_object_proxy.create(${JSON.stringify(
        ObjectProxy.get(resource.metadata as any),
        null,
        2
      )}, ${this.configModule.serialize(path.dirname(this.filename), false)})`;

    return `
      import { ObjectProxy as __pages_object_proxy } from '@grexie/pages/utils/proxy';
      ${await resource.serialize({ serializeMetadata, imports: true })}
      ${this.configModule.serialize(path.dirname(this.filename), true)}

      ${await resource.serialize({
        serializeMetadata,
        imports: false,
      })}
    `;
  }
}
