import { ModuleResolver } from './ModuleResolver.js';
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

  /**
   * Loads a module from the filesystem
   * @param filename
   */
  async load(filename: string): Promise<Module> {
    throw new Error('not implemented');
  }

  abstract instantiate(module: Module): Promise<any>;

  /**
   * Parses a module source file
   * @param context the context of the request
   * @param source the source code
   */
  async parse(context: string, source: string): Promise<ModuleReference[]> {
    throw new Error('not implemented');
  }

  /**
   * Resolves modules
   * @param context the context of the requests
   * @param requests an array of requests
   */
  async resolve(
    context: string,
    ...requests: string[]
  ): Promise<ModuleReference[]> {
    throw new Error('not implemented');
  }
}

export class CommonJsModuleLoader extends ModuleLoader {
  async instantiate(module: Module): Promise<any> {}
}
