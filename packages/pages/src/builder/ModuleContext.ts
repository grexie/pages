import { Compilation } from 'webpack';
import { BuildContext } from './BuildContext.js';
import { ModuleResolver } from './ModuleResolver.js';
import { InstantiatedModule, ModuleLoader } from './ModuleLoader.js';
import { ModuleResolverOptions } from './ModuleResolver.js';

export interface ModuleContextOptions {
  context: BuildContext;
  compilation: Compilation;
}

export class ModuleContext {
  readonly compilation: Compilation;
  readonly resolver: ModuleResolver;
  readonly loader: ModuleLoader;
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
    this.loader = new ModuleLoader({
      context: this,
      compilation,
      resolver: this.resolver,
    });
  }

  async require(context: string, request: string): Promise<InstantiatedModule> {
    const reference = await this.resolver.resolve(context, request);
    return this.loader.load(context, reference.filename);
  }

  async create(
    context: string,
    filename: string,
    source: string
  ): Promise<InstantiatedModule> {
    return this.loader.create(context, filename, source);
  }
}
