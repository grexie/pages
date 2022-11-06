import { Compilation } from 'webpack';
import { BuildContext } from './BuildContext.js';
import { ModuleResolver } from './ModuleResolver.js';
import {
  CommonJsModuleLoader,
  EsmModuleLoader,
  ModuleLoader,
} from './ModuleLoader.js';
import { Module } from 'vm';
import { ModuleResolverOptions } from './ModuleContext.js';

export enum ModuleLoaderType {
  commonjs = 'commonjs',
  esm = 'esm',
}

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
    });

    if (Module) {
      this.loaders[ModuleLoaderType.esm] = new EsmModuleLoader({
        resolver: this.resolver,
        compilation,
      });
    }
  }

  async require(context: string, request: string): Promise<any> {
    throw new Error('not implemented');
  }

  async load(filename: string, source: string): Promise<any> {
    throw new Error('not implemented');
  }
}
