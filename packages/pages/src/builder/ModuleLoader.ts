import { ModuleResolver } from './ModuleResolver.js';
import { Compilation } from 'webpack';
import { parseAsync, traverse } from '@babel/core';
import babelPresetEnv from '@babel/preset-env';
import * as t from '@babel/types';
import { createResolver } from '../utils/resolvable.js';
import webpack from 'webpack';
import path from 'path';
import vm from 'vm';
import { attach as attachHotReload } from '../runtime/hmr.js';

const vmGlobal = { process } as any;
vmGlobal.global = vmGlobal;
attachHotReload(vmGlobal);
export const vmContext = vm.createContext(vmGlobal);

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
  readonly webpackModule: webpack.Module;
  readonly references: ModuleReference[];
}

export abstract class ModuleLoader {
  readonly resolver: ModuleResolver;
  readonly compilation: Compilation;
  readonly modules: Record<string, Promise<Module> | undefined> = {};

  constructor({ resolver, compilation }: ModuleLoaderOptions) {
    this.resolver = resolver;
    this.compilation = compilation;
  }

  /**
   * Loads a module from the filesystem
   * @param filename
   */
  async load(filename: string): Promise<Module> {
    if (this.modules[filename]) {
      return this.modules[filename]!;
    }

    const resolver = createResolver<Module>();
    this.modules[filename] = resolver;

    const context = path.dirname(filename);

    let phase = 'starting';
    const interval = setInterval(() => {
      if (process.env.PAGES_DEBUG_LOADERS === 'true') {
        console.info(`module-loader:${phase}`, filename);
      }
    }, 5000);

    try {
      phase = 'create';
      const webpackModule = await new Promise<webpack.Module>(
        (resolve, reject) =>
          this.compilation.params.normalModuleFactory.create(
            {
              context,
              contextInfo: {
                issuer: 'pages',
                compiler: 'javascript/auto',
              },
              dependencies: [
                new webpack.dependencies.ModuleDependency(filename),
              ],
            },
            (err, result) => {
              if (err) {
                reject(err);
                return;
              }

              resolve(result!.module!);
            }
          )
      );

      webpackModule.buildInfo = {};
      webpackModule.buildMeta = {};

      phase = 'build';
      await new Promise((resolve, reject) => {
        try {
          this.compilation.buildQueue.add(webpackModule, (err, result) => {
            if (err) {
              reject(err);
              return;
            }

            resolve(result);
          });
        } catch (err) {
          reject(err);
        }
      });

      phase = 'built';

      if (webpackModule.getNumberOfErrors()) {
        throw Array.from(webpackModule.getErrors() as any)[0];
      }

      const source = webpackModule.originalSource()?.buffer().toString();

      if (typeof source !== 'string') {
        throw new Error(`unable to load module ${filename}`);
      }

      const references = await this.parse(context, source);

      resolver.resolve({ filename, source, webpackModule, references });
    } catch (err) {
      resolver.reject(err);
    } finally {
      // delete this.modules[filename];
      clearInterval(interval);
    }

    return resolver;
  }

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

export interface CommonJsModule extends Module {}

export class CommonJsModuleLoader extends ModuleLoader {
  async instantiate(module: Module): Promise<CommonJsModule> {}
}
