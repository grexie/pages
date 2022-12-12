import type { SourceResolver, BuildContext } from './BuildContext.js';
import type {
  Config,
  ConfigContext as RuntimeConfigContext,
  Context,
} from '@grexie/pages/api';
import type { Source } from './Source.js';
import type { InstantiatedModule } from './ModuleLoader.js';
import { ObjectProxy, SchemaSymbol } from '@grexie/proxy';
import path from 'path';
import { Compilation } from 'webpack';

export interface ConfigOptions {
  context: Context;
  parent?: ConfigModule;
  source: Source;
  module: InstantiatedModule;
}

export interface ConfigResolverOptions {
  context: BuildContext;
}

export class ConfigModule {
  readonly context: Context;
  readonly parent?: ConfigModule;
  readonly source: Source;
  readonly module: InstantiatedModule;

  constructor({ parent, source, module, context }: ConfigOptions) {
    this.context = context;
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

  async create(
    extra?: Partial<Config>,
    extraContext?: RuntimeConfigContext
  ): Promise<Config> {
    const parent = await this.parent?.create();
    const { exports } = this.module;
    if (!exports.default) {
      throw new Error(`${this.module.filename} has no config export`);
    }
    const { default: configFactory } = exports;
    let config = configFactory(
      {
        context: this.context,
        filename: this.module.filename,
        dirname: path.dirname(this.module.filename),
      },
      parent
    );
    if (extra) {
      config[SchemaSymbol].setContext(extra, extraContext);
      config = ObjectProxy.create<Config>(extra, config);
    }
    return config;
  }

  serialize(context: string, imports: boolean, index: number = 1): string {
    if (imports) {
      const configImport = `import __pages_config_${index} from ${JSON.stringify(
        `${this.source.relpath(context)}`
      )}`;

      if (this.parent) {
        return `${configImport}\n${this.parent.serialize(
          context,
          true,
          index + 1
        )}`;
      } else {
        return configImport;
      }
    } else {
      const configFactory = `__pages_config_${index}`;

      if (this.parent) {
        return `${configFactory}(context, ${this.parent.serialize(
          context,
          false,
          index + 1
        )})`;
      } else {
        return `${configFactory}(context)`;
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
    return new ConfigModule({
      parent,
      source,
      module: _module,
      context: this.context,
    });
  }

  async create(
    compilation: Compilation,
    path: string[]
  ): Promise<ConfigModule> {
    let stack = [this.context.root.sources];
    let el: SourceResolver | undefined;
    const sources = [];
    const seen = new Set<string>();
    while ((el = stack.shift())) {
      const els = await el.context.registry.listConfig({ path });
      for (const el2 of els) {
        if (!seen.has(el2.abspath)) {
          sources.push(el2);
        }
        seen.add(el2.abspath);
      }
      stack.push(...el.children);
    }

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
