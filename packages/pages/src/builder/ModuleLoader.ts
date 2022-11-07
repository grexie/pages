import type { ModuleReference, ModuleResolver } from './ModuleResolver.js';
import type { Compiler, Compilation } from 'webpack';
import { parseAsync, traverse } from '@babel/core';
import babelPresetEnv from '@babel/preset-env';
import * as t from '@babel/types';
import { createResolver } from '../utils/resolvable.js';
import webpack from 'webpack';
import vm from 'vm';
import { attach as attachHotReload } from '../runtime/hmr.js';
import type { ModuleContext } from './ModuleContext.js';
import { Volume } from 'memfs';
import { promisify } from '../utils/promisify.js';
import path from 'path';

const vmGlobal = { process } as any;
vmGlobal.global = vmGlobal;
attachHotReload(vmGlobal);
export const vmContext = vm.createContext(vmGlobal);

export enum ModuleLoaderType {
  commonjs = 'commonjs',
  esm = 'esm',
}

export interface ModuleLoaderOptions {
  context: ModuleContext;
  resolver: ModuleResolver;
  compilation: Compilation;
}

export interface Module {
  readonly context: string;
  readonly filename: string;
  readonly source: string;
  readonly references: ModuleReference[];
}

export interface InstantiatedModule extends Module {
  readonly webpackModule: webpack.Module;
  readonly exports: any;
}

const ModulePromiseTable = new WeakMap<
  Compilation,
  Record<string, Promise<InstantiatedModule> | undefined>
>();

export class ModuleLoader {
  readonly context: ModuleContext;
  readonly resolver: ModuleResolver;
  readonly compilation: Compilation;
  readonly modules;
  #nextId = 0;

  constructor({ context, resolver, compilation }: ModuleLoaderOptions) {
    this.context = context;
    this.resolver = resolver;
    this.compilation = compilation;
    // if (!ModulePromiseTable.has(compilation)) {
    //   ModulePromiseTable.set(compilation, {});
    // }
    // this.modules = ModulePromiseTable.get(compilation)!;
    this.modules = {} as Record<
      string,
      Promise<InstantiatedModule> | undefined
    >;
  }

  async #build(
    filename: string,
    webpackModule: webpack.Module,
    dependency: webpack.Dependency
  ): Promise<InstantiatedModule> {
    const context = webpackModule.context!;

    const executeResult = await new Promise<any>((resolve, reject) => {
      try {
        this.compilation.addModule(webpackModule, (err, result) => {
          if (err) {
            reject(err);
            return;
          }

          this.compilation.buildModule(result!, err => {
            if (err) {
              reject(err);
              return;
            }

            // resolve(result!);

            this.compilation.processModuleDependencies(result!, err => {
              if (err) {
                reject(err);
                return;
              }

              this.compilation.executeModule(
                result!,
                {
                  entryOptions: {
                    publicPath: '/',
                  },
                },
                (err, executeResult) => {
                  if (executeResult) {
                    webpackModule = result!;
                    resolve(executeResult);
                    return;
                  }
                  if (err) {
                    reject(err);
                    return;
                  }

                  webpackModule = result!;
                  resolve(executeResult);
                }
              );
            });
          });
        });
      } catch (err) {
        reject(err);
      }
    });

    if (webpackModule.getNumberOfErrors()) {
      throw Array.from(webpackModule.getErrors() as any)[0];
    }

    const source = webpackModule.originalSource()?.buffer().toString();
    if (typeof source !== 'string') {
      throw new Error(`unable to load module ${filename}`);
    }

    return {
      context,
      filename,
      source,
      references: [],
      webpackModule,
      exports: executeResult.exports,
    };
  }

  /**
   * Loads a module from the filesystem
   * @param filename
   */
  async load(context: string, request: string): Promise<InstantiatedModule> {
    const reference = await this.resolver.resolve(context, request);

    if (this.modules[reference.filename]) {
      return this.modules[reference.filename]!;
    }

    const resolver = createResolver<InstantiatedModule>();
    this.modules[reference.filename] = resolver;

    try {
      const dependency = new webpack.dependencies.ModuleDependency(request);
      const webpackModule = await new Promise<webpack.Module>(
        (resolve, reject) =>
          this.compilation.params.normalModuleFactory.create(
            {
              context,
              contextInfo: {
                issuer: 'pages',
                compiler: 'javascript/auto',
              },
              dependencies: [dependency],
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

      resolver.resolve(
        this.#build(reference.filename, webpackModule, dependency)
      );
    } catch (err) {
      resolver.reject(err);
    } finally {
      return resolver;
    }
  }

  /**
   * Creates a module from source
   * @param filename
   */
  async create(
    context: string,
    filename: string,
    source: string
  ): Promise<InstantiatedModule> {
    filename = filename + '$' + ++this.#nextId;

    if (this.modules[filename]) {
      return this.modules[filename]!;
    }

    const resolver = createResolver<InstantiatedModule>();
    this.modules[filename] = resolver;

    try {
      const volume = new Volume();
      const writeFile = promisify(volume, volume.writeFile);
      const mkdir = promisify(volume, volume.mkdir);
      await mkdir(path.dirname(filename), { recursive: true });
      await writeFile(filename, source);

      this.context.build.builder.buildFiles.add(
        filename,
        volume,
        false,
        filename
      );

      const dependency = new webpack.dependencies.ModuleDependency(
        `./${path.basename(filename)}`
      );
      const webpackModule = await new Promise<webpack.NormalModule>(
        (resolve, reject) => {
          try {
            this.compilation.params.normalModuleFactory.create(
              {
                context: path.dirname(filename),
                contextInfo: {
                  issuer: 'pages',
                  compiler: 'javascript/auto',
                },
                dependencies: [dependency],
              },
              (err, result) => {
                if (err) {
                  reject(err);
                  return;
                }

                resolve(result!.module! as webpack.NormalModule);
              }
            );
          } catch (err) {
            reject(err);
          }
        }
      );

      resolver.resolve(
        this.#build(filename, webpackModule, dependency).then(module => {
          this.context.build.builder.buildFiles.remove(filename);
          return module;
        })
      );
    } catch (err) {
      resolver.reject(err);
    } finally {
      return resolver;
    }
  }

  // abstract instantiate(module: Module): Promise<InstantiatedModule>;

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
