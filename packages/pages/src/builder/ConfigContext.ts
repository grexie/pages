import { BuildContext } from './BuildContext';
import { ResourceMetadata, Source } from '../api';
import { Module, ModuleFactory } from './ModuleContext';
import { Module as VMModule } from 'vm';
import { ObjectProxy } from '../utils/proxy';
import path from 'path';

export interface ConfigOptions {
  parent?: ConfigModule;
  module: Module;
}

export interface ConfigResolverOptions {
  context: BuildContext;
}

export interface Config extends Record<string, any> {
  metadata: ResourceMetadata;
}

export class ConfigModule {
  readonly parent?: ConfigModule;
  readonly module: Module;

  constructor({ parent, module }: ConfigOptions) {
    this.parent = parent;
    this.module = module;
  }

  get ancestors() {
    let out = [];
    let config: ConfigModule | undefined = this;
    do {
      out.push(config);
    } while ((config = config.parent));
    return out;
  }

  async create(extra?: Config): Promise<Config> {
    const parent = this.parent?.create();
    await this.module.load();
    const { exports } = this.module;
    if (!exports.config) {
      throw new Error(`${this.module.filename} has no config export`);
    }
    const { config: configFactory } = exports;
    let config = configFactory(parent);
    if (extra) {
      config = ObjectProxy.create<Config>(extra, config);
    }
    return config;
  }

  serialize(context: string): string {
    const metadataFactory = `require(${JSON.stringify(
      `./${path.relative(context, this.module.filename)}`
    )}).metadata`;
    if (this.parent) {
      return `${metadataFactory}(${this.parent.serialize(context)})`;
    } else {
      return `${metadataFactory}()`;
    }
  }
}

export class ConfigContext {
  readonly context: BuildContext;

  constructor({ context }: ConfigResolverOptions) {
    this.context = context;
  }

  async #createConfigModule(
    factory: ModuleFactory,
    parent: ConfigModule | undefined,
    source: Source
  ): Promise<ConfigModule> {
    const _module = await this.context.modules.require(
      factory,
      source.dirname,
      source.filename
    );
    return new ConfigModule({ parent, module: _module });
  }

  async create(factory: ModuleFactory, path: string[]): Promise<ConfigModule> {
    const sources = await this.context.registry.listConfig({ path });
    sources.sort((a, b) => a.path.length - b.path.length);
    let configModule: ConfigModule | undefined;
    for (const source of sources) {
      configModule = await this.#createConfigModule(
        factory,
        configModule,
        source
      );
    }
    if (!configModule) {
      throw new Error('invalid configuration: no configs');
    }
    return configModule;
  }
}
