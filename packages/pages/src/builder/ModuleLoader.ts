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
  node = 'node',
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
  // readonly references: ModuleReferenceTable;
}

export type ModuleReferenceTable = Record<string, ModuleReference>;

export interface InstantiatedModule extends Module {
  readonly vmModule: vm.Module;
  readonly exports: any;
}

type ModuleCache = Record<string, Promise<InstantiatedModule> | undefined>;

const ModuleCacheTable = new WeakMap<Compilation, ModuleCache>();

export abstract class ModuleLoader {
  readonly context: ModuleContext;
  readonly resolver: ModuleResolver;
  readonly compilation: Compilation;
  readonly modules: ModuleCache;
  #nextId = 0;

  constructor({ context, resolver, compilation }: ModuleLoaderOptions) {
    this.context = context;
    this.resolver = resolver;
    this.compilation = compilation;
    if (!ModuleCacheTable.has(compilation)) {
      ModuleCacheTable.set(compilation, {});
    }
    this.modules = ModuleCacheTable.get(compilation)!;
  }

  static reset(compilation: webpack.Compilation) {
    const modules = ModuleCacheTable.get(compilation) ?? {};
    for (const k in modules) {
      delete modules[k];
    }
  }

  static evict(compilation: webpack.Compilation, filename: string) {
    const modules = ModuleCacheTable.get(compilation) ?? {};
    delete modules[filename];
  }

  protected async build(
    context: string,
    filename: string,
    webpackModule: webpack.Module
  ): Promise<InstantiatedModule> {
    await new Promise<void>((resolve, reject) => {
      try {
        this.compilation.buildModule(webpackModule, (err, module) => {
          if (err) {
            reject(err);
            return;
          }

          resolve();
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

    // const references = await this.parse(context, source);

    return this.instantiate({
      context,
      filename,
      source,
      // references,
    });
  }

  protected abstract instantiate(module: Module): Promise<InstantiatedModule>;

  /**
   * Loads a module from the filesystem
   * @param filename
   */
  async load(context: string, request: string): Promise<InstantiatedModule> {
    const reference = await this.resolver.resolve(context, request);

    const module = this.modules[reference.filename];
    if (module) {
      return module;
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
        this.build(
          path.dirname(reference.filename),
          reference.filename,
          webpackModule
        )
      );
    } catch (err) {
      resolver.reject(err);
    }

    return resolver;
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

    const module = await this.build(
      path.dirname(filename),
      filename,
      webpackModule
    );
    this.context.build.builder.buildFiles.remove(filename);
    return module;
  }

  /**
   * Parses a module source file
   * @param context the context of the request
   * @param source the source code
   */
  async parse(context: string, source: string): Promise<ModuleReferenceTable> {
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
  protected async resolve(
    context: string,
    ...requests: string[]
  ): Promise<ModuleReferenceTable> {
    const references = await Promise.all(
      requests.map(async request => ({
        [request]: await this.resolver.resolve(context, request),
      }))
    );
    return references.reduce((a, b) => ({ ...a, ...b }), {});
  }
}
