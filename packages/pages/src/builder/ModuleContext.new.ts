import { Compilation } from 'webpack';
import { BuildContext } from './BuildContext.js';
import { ModuleResolver } from './ModuleResolver.js';
import {
  ModuleLoaderType,
  InstantiatedModule,
  ModuleLoader,
} from './ModuleLoader.js';
import { EsmModuleLoader } from './EsmModuleLoader.js';
import { CommonJsModuleLoader } from './CommonJsModuleLoader.js';
import vm from 'vm';
import { ModuleResolverOptions } from './ModuleContext.js';

export interface ModuleContextOptions {
  context: BuildContext;
  compilation: Compilation;
}

export class ModuleContext {
  readonly compilation: Compilation;
  readonly resolver: ModuleResolver;
  readonly loaders: Record<ModuleLoaderType, ModuleLoader | undefined>;

  constructor({
    context,
    compilation,
    ...resolverOptions
  }: ModuleContextOptions & ModuleResolverOptions) {
    this.compilation = compilation;
    this.resolver = new ModuleResolver({
      context,
      compilation,
      ...resolverOptions,
    });

    this.loaders = {} as Record<ModuleLoaderType, ModuleLoader>;

    this.loaders[ModuleLoaderType.commonjs] = new CommonJsModuleLoader({
      resolver: this.resolver,
      compilation,
      context: this,
    });

    if (vm.Module) {
      this.loaders[ModuleLoaderType.esm] = new EsmModuleLoader({
        resolver: this.resolver,
        compilation,
        context: this,
      });
    }
  }

  async require(
    context: string,
    request: string,
    loader?: ModuleLoaderType
  ): Promise<InstantiatedModule> {
    const reference = await this.resolver.resolve(context, request);

    if (!loader) {
      loader = reference.loader;
    }
    const loaderInstance = this.loaders[loader]!;

    const module = await loaderInstance.load(context, reference.filename);
  }

  async instantiate(
    context: string,
    filename: string,
    source: string,
    loader?: ModuleLoaderType
  ): Promise<InstantiatedModule> {
    if (!loader) {
      const reference = await this.resolver.resolve(context, filename);
      loader = reference.loader;
    }
    const loaderInstance = this.loaders[loader]!;

    const references = await loaderInstance.parse(context, source);

    const module = await loaderInstance.instantiate({
      context,
      filename,
      source,
      references,
    });

    return module;
  }
}
