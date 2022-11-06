import { ModuleResolver } from './ModuleResolver.js';
import { Compilation } from 'webpack';
import { parseAsync, traverse } from '@babel/core';
import babelPresetEnv from '@babel/preset-env';
import * as t from '@babel/types';

export interface ModuleReference {
  readonly filename: string;
  readonly compile: boolean;
  readonly builtin: boolean;
  readonly esm: boolean;
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
    const transpiled = await parseAsync(source, {
      ast: true,
      presets: [
        [
          babelPresetEnv,
          {
            modules: false,
          },
        ],
      ],
      plugins: [],
      include: () => true,
      exclude: [],
    });

    const requests: string[] = [];

    traverse(transpiled, {
      CallExpression: (path: any) => {
        if (
          t.isIdentifier(path.node.callee, {
            name: 'require',
          })
        ) {
          const id = path.node.arguments[0];

          if (t.isStringLiteral(id)) {
            requests.push(id.value);
          }
        }
      },
      ImportDeclaration: (path: any) => {
        requests.push(path.node.source.value);
      },
      ExportAllDeclaration: (path: any) => {
        requests.push(path.node.source.value);
      },
      ExportNamedDeclaration: (path: any) => {
        if (path.node.source) {
          requests.push(path.node.source.value);
        }
      },
    });

    return this.resolve(context, ...requests);
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
    return Promise.all(
      requests.map(request => this.resolver.resolve(context, request))
    );
  }
}

export class CommonJsModuleLoader extends ModuleLoader {
  async instantiate(module: Module): Promise<any> {}
}

export class EsmModuleLoader extends ModuleLoader {
  async instantiate(module: Module): Promise<any> {}
}
