import { Compilation } from 'webpack';
import { BuildContext } from './BuildContext';
import { ModuleResolver } from './ModuleResolver';
import {
  CommonJsModuleLoader,
  EsmModuleLoader,
  ModuleLoader,
} from './ModuleLoader';
import { Module } from 'vm';

export enum ModuleLoaderType {
  commonjs = 'commonjs',
  esm = 'esm',
}

export interface ModuleContextOptions {
  context: BuildContext;
  compilation: Compilation;
  loader?: ModuleLoaderType;
}

export class ModuleContext {
  readonly compilation: Compilation;
  readonly resolver: ModuleResolver;
  readonly loader: ModuleLoader;

  constructor({
    context,
    compilation,
    loader = Module ? ModuleLoaderType.esm : ModuleLoaderType.commonjs,
  }: ModuleContextOptions) {
    this.compilation = compilation;
    this.resolver = new ModuleResolver({ context, compilation });

    switch (loader) {
      case ModuleLoaderType.commonjs:
        this.loader = new CommonJsModuleLoader({
          resolver: this.resolver,
          compilation,
        });
        break;
      case ModuleLoaderType.esm:
        this.loader = new EsmModuleLoader({
          resolver: this.resolver,
          compilation,
        });
        break;
    }
  }

  async require(context: string, request: string): Promise<any> {
    throw new Error('not implemented');
  }

  async load(filename: string, source: string): Promise<any> {
    throw new Error('not implemented');
  }
}
