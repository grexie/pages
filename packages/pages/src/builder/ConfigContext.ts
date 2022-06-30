import { BuildContext } from './BuildContext';
import { ResourceMetadata, Source } from '../api';
import { Module, ModuleFactory } from './ModuleContext';
import { ObjectProxy } from '../utils/proxy';

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

  create(module: NodeModule, extra?: Config): Config {
    const parent = this.parent?.create(module);
    const exports = this.module.load(module).exports;
    let config = ObjectProxy.create<Config>(
      {
        ...exports.config,
        metadata: exports.metadata,
      },
      parent
    );
    if (extra) {
      config = ObjectProxy.create<Config>(extra, config);
    }
    return config;
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
