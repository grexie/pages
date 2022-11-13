import { Compilation } from 'webpack';
import { BuildContext } from './BuildContext.js';
import { ModuleResolver } from './ModuleResolver.js';
import {
  InstantiatedModule,
  ModuleLoader,
  ModuleLoaderOptions,
  ModuleLoaderType,
} from './ModuleLoader.js';
import { ModuleResolverOptions } from './ModuleResolver.js';
import path from 'path';
import { EsmModuleLoader } from './EsmModuleLoader.js';
import { CommonJsModuleLoader } from './CommonJsModuleLoader.js';
import { NodeModuleLoader } from './NodeModuleLoader.js';
import { timedAsync } from '../utils/timed.js';

export interface ModuleContextOptions {
  context: BuildContext;
  compilation: Compilation;
}

const moduleLoaders: Record<
  ModuleLoaderType,
  typeof ModuleLoader &
    (new (options: ModuleLoaderOptions) => InstanceType<typeof ModuleLoader>)
> = {
  esm: EsmModuleLoader,
  commonjs: CommonJsModuleLoader,
  node: NodeModuleLoader,
};

export class ModuleContext {
  readonly compilation: Compilation;
  readonly resolver: ModuleResolver;
  readonly loaders = {} as Record<ModuleLoaderType, ModuleLoader>;
  readonly build: BuildContext;

  constructor({
    context,
    compilation,
    ...resolverOptions
  }: ModuleContextOptions & ModuleResolverOptions) {
    this.build = context;
    this.compilation = compilation;
    this.resolver = new ModuleResolver({
      context,
      compilation,
      ...resolverOptions,
    });
    this.loaders = Object.values(ModuleLoaderType)
      .map(type => ({
        [type]: new (moduleLoaders[type] as any)({
          context: this,
          compilation,
          resolver: this.resolver,
        }) as ModuleLoader,
      }))
      .reduce((a, b) => ({ ...a, ...b }), {}) as Record<
      ModuleLoaderType,
      ModuleLoader
    >;
  }

  reset() {
    ModuleLoader.reset(this.compilation);
  }

  evict(filename: string) {
    ModuleLoader.evict(this.compilation, filename);
  }

  protected getContextFromMeta(meta: ImportMeta) {
    return path.dirname(this.getFilenameFromMeta(meta));
  }

  protected getFilenameFromMeta(meta: ImportMeta) {
    return new URL(meta.url).pathname;
  }

  async require(meta: NodeModule | ImportMeta, request: string): Promise<any> {
    let context: string;

    if ((meta as ImportMeta).url) {
      context = this.getContextFromMeta(meta as ImportMeta);
    } else if ((meta as NodeModule).filename) {
      context = path.dirname((meta as NodeModule).filename);
    } else {
      throw new Error('unknown meta object');
    }

    const module = await this.requireModule(context, request);
    return module.vmModule.namespace;
  }

  async requireMany(
    meta: NodeModule | ImportMeta,
    ...requests: string[]
  ): Promise<any[]> {
    let context: string;
    let filename: string;

    if ((meta as ImportMeta).url) {
      context = this.getContextFromMeta(meta as ImportMeta);
      filename = this.getFilenameFromMeta(meta as ImportMeta);
    } else if ((meta as NodeModule).filename) {
      context = path.dirname((meta as NodeModule).filename);
      filename = (meta as NodeModule).filename;
    } else {
      throw new Error('unknown meta object');
    }

    const module = await this.createModule(
      context,
      filename,
      `
      export default Promise.all([
        ${requests
          .map(request => `import(${JSON.stringify(request)})`)
          .join(',\n')}
      ]);
    `,
      ModuleLoaderType.esm
    );

    return (module.vmModule.namespace as any).default;
  }

  requireModule = timedAsync(
    async (context: string, request: string): Promise<InstantiatedModule> => {
      const reference = await this.resolver.resolve(context, request);
      return this.loaders[reference.loader].require(context, request);
    }
  );

  createModule = timedAsync(
    async (
      context: string,
      filename: string,
      source: string,
      loader?: ModuleLoaderType
    ): Promise<InstantiatedModule> => {
      if (!loader) {
        const reference = await this.resolver.resolve(context, filename);
        loader = reference.loader;
      }

      return this.loaders[loader!].create(context, filename, source);
    }
  );

  log() {
    console.info('\n---');

    this.resolver.resolve.timed.log('resolve');
    this.resolver.resolve.timed.reset();

    this.requireModule.timed.log('requireModule');
    this.requireModule.timed.reset();

    this.createModule.timed.log('createModule');
    this.createModule.timed.reset();

    console.info('---');
  }
}
