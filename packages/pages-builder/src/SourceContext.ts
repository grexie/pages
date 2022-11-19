import { Source, SourceOptions } from './Source.js';
import { ContentResource, Resource, Config } from '@grexie/pages/api';
import type { BuildContext } from './BuildContext.js';
import type { InstantiatedModule } from './ModuleLoader.js';
import type { Compilation } from 'webpack';
import { ModuleResource } from './ModuleResource.js';
import type { ConfigModule } from './ConfigContext.js';
import path from 'path';
import { ObjectProxy } from '@grexie/proxy';

export interface CreateContentOptions<C = any> {
  content: C;
}

export type SourceCompiler = (source: string) => string;

export interface SourceContextOptions extends SourceOptions {
  context: BuildContext;
  compilation: Compilation;
  module: InstantiatedModule;
  content: Buffer;
  config: Config;
  configModule: ConfigModule;
}

export class SourceContext extends Source {
  readonly context: BuildContext;
  readonly compilation: Compilation;
  readonly module: InstantiatedModule;
  readonly content: Buffer;
  readonly config: Config;
  readonly configModule: ConfigModule;

  #index = 0;

  constructor({
    context,
    compilation,
    module,
    content,
    config,
    configModule,
    ...options
  }: SourceContextOptions) {
    super(options);
    this.context = context;
    this.compilation = compilation;
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
    map,
    esm = false,
  }: {
    source: string;
    map?: any;
    esm?: boolean;
  }) {
    const module = await this.context
      .getModuleContext(this.compilation)
      .createModule(this.dirname, this.abspath, source);

    const { exports } = module;

    return new ModuleResource({
      path: this.path,
      metadata: this.metadata,
      source,
      map,
      exports,
    });
  }

  async serialize(resource: Resource): Promise<{ code: string; map?: any }> {
    const serializeMetadata = (source: string) =>
      `__pages_object_proxy.create(${JSON.stringify(
        ObjectProxy.get(resource.metadata as any),
        null,
        2
      )}, ${this.configModule.serialize(this.dirname, false)})`;

    const { code: imports } = await resource.serialize({
      serializeMetadata,
      imports: true,
    });
    const { code, map } = await resource.serialize({
      serializeMetadata,
      imports: false,
    });

    return {
      code: `
      import { ObjectProxy as __pages_object_proxy } from '@grexie/proxy';
      ${imports}
      ${this.configModule.serialize(this.dirname, true)}

      ${code}
    `,
      map,
    };
  }
}
