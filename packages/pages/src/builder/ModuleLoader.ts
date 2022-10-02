import { ModuleResolver } from './ModuleResolver';
import { Compilation } from 'webpack';

export interface ModuleReference {
  readonly filename: string;
  readonly compile: boolean;
  readonly builtin: boolean;
}

export interface ModuleLoaderOptions {
  resolver: ModuleResolver;
  compilation: Compilation;
}

export interface Module {
  readonly filename: string;
  readonly source: string;
  readonly references: ModuleReference[];
}

export abstract class ModuleLoader {
  readonly resolver: ModuleResolver;
  readonly compilation: Compilation;

  constructor({ resolver, compilation }: ModuleLoaderOptions) {
    this.resolver = resolver;
    this.compilation = compilation;
  }

  async load(filename: string): Promise<Module> {
    throw new Error('not implemented');
  }

  abstract instantiate(module: Module): Promise<any>;

  async parse(context: string, source: string): Promise<ModuleReference[]> {
    throw new Error('not implemented');
  }

  async resolve(
    context: string,
    ...requests: string[]
  ): Promise<ModuleReference[]> {
    throw new Error('not implemented');
  }
}

export class EsmModuleLoader extends ModuleLoader {
  async instantiate(module: Module): Promise<any> {}
}

export class CommonJsModuleLoader extends ModuleLoader {
  async instantiate(module: Module): Promise<any> {}
}
