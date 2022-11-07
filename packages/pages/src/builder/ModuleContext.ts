import { Compilation } from 'webpack';
import { BuildContext } from './BuildContext.js';
import { ModuleResolver } from './ModuleResolver.js';
import { InstantiatedModule, ModuleLoader } from './ModuleLoader.js';
import { ModuleResolverOptions } from './ModuleResolver.js';
import path from 'path';

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

  getContextFromMeta(meta: ImportMeta) {
    return path.dirname(new URL(meta.url).pathname);
  }

  async require(meta: NodeModule | ImportMeta, request: string): Promise<any> {
    let context: string;

    if ((meta as ImportMeta).url) {
      context = this.getContextFromMeta(meta as ImportMeta);
    } else if((meta as NodeModule).filename) {
      context = path.dirname((meta as NodeModule).filename);
    } else {
      throw new Error("unknown meta object");
    }

    const module = await this.requireModule(context, request);
    return module.exports;
  }

  async requireModule(
    context: string,
    request: string
  ): Promise<InstantiatedModule> {
    const reference = await this.resolver.resolve(context, request);
    return this.loader.load(context, reference.filename);
  }

  async createModule(
    context: string,
    filename: string,
    source: string
  ): Promise<InstantiatedModule> {
    return this.loader.create(context, filename, source);
  }
}
