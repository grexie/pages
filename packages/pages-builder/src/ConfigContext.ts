import type { BuildContext } from './BuildContext.js';
import type { Config } from '@grexie/pages/api';
import type { Source } from './Source.js';
import type { InstantiatedModule } from './ModuleLoader.js';
import { ObjectProxy } from '@grexie/proxy';
import path from 'path';
import type { Compilation } from 'webpack';
import { Registry } from './Registry.js';

export interface ConfigOptions {
  parent?: ConfigModule;
  source: Source;
  module: InstantiatedModule;
}

export interface ConfigResolverOptions {
  context: BuildContext;
}

export class ConfigModule {
  readonly parent?: ConfigModule;
  readonly source: Source;
  readonly module: InstantiatedModule;

  constructor({ parent, source, module }: ConfigOptions) {
    this.parent = parent;
    this.source = source;
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

  async create(extra?: Partial<Config>): Promise<Config> {
    const parent = await this.parent?.create();
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

  serialize(context: string, imports: boolean, index: number = 1): string {
    if (imports) {
      const metadataImport = `import { metadata as __pages_metadata_${index} } from ${JSON.stringify(
        `${this.source.relpath(context)}`
      )}`;

      if (this.parent) {
        return `${metadataImport}\n${this.parent.serialize(
          context,
          true,
          index + 1
        )}`;
      } else {
        return metadataImport;
      }
    } else {
      const metadataFactory = `__pages_metadata_${index}`;

      if (this.parent) {
        return `${metadataFactory}(${this.parent.serialize(
          context,
          false,
          index + 1
        )})`;
      } else {
        return `${metadataFactory}()`;
      }
    }
  }
}

export class ConfigContext {
  readonly context: BuildContext;

  constructor({ context }: ConfigResolverOptions) {
    this.context = context;
  }

  async #createConfigModule(
    compilation: Compilation,
    parent: ConfigModule | undefined,
    source: Source
  ): Promise<ConfigModule> {
    const _module = await this.context
      .getModuleContext(compilation)
      .requireModule(source.dirname, source.abspath);
    return new ConfigModule({ parent, source, module: _module });
  }

  async create(
    compilation: Compilation,
    path: string[]
  ): Promise<ConfigModule> {
    const sources = await this.context.registry.listConfig({ path });
    sources.sort((a, b) => a.path.length - b.path.length);

    let configModule: ConfigModule | undefined;
    for (const source of sources) {
      configModule = await this.#createConfigModule(
        compilation,
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
