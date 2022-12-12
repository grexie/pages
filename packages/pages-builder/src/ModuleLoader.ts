import type { ModuleReference, ModuleResolver } from './ModuleResolver.js';
import type { Compilation } from 'webpack';
import { createResolver } from '@grexie/resolvable';
import webpack from 'webpack';
import vm from 'vm';
import { attach as attachHotReload } from '@grexie/pages-runtime-hmr';
import type { ModuleContext } from './ModuleContext.js';
import path from 'path';
import { isPlainObject } from '@grexie/is-plain-object';
import type { BuildContext } from './BuildContext.js';

const vmGlobal = { process, URL, URLSearchParams } as any;
vmGlobal.global = vmGlobal;
attachHotReload(vmGlobal);
const vmContext = vm.createContext(vmGlobal);

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
const GlobalModuleCacheTable = new WeakMap<BuildContext, ModuleCache>();
const GlobalTable = new WeakMap<Compilation, any>();
const VMContextTable = new WeakMap<Compilation, any>();

export abstract class ModuleLoader {
  readonly context: ModuleContext;
  readonly resolver: ModuleResolver;
  readonly compilation: Compilation;
  readonly modules: ModuleCache;
  readonly globalModules: ModuleCache;
  readonly vmGlobal: any;
  readonly vmContext: vm.Context;
  #nextId = 0;

  constructor({ context, resolver, compilation }: ModuleLoaderOptions) {
    this.context = context;
    this.resolver = resolver;
    this.compilation = compilation;

    if (!ModuleCacheTable.has(compilation)) {
      ModuleCacheTable.set(compilation, {});
    }
    this.modules = ModuleCacheTable.get(compilation)!;

    if (!GlobalModuleCacheTable.has(context.build)) {
      GlobalModuleCacheTable.set(context.build, {});
    }
    this.globalModules = GlobalModuleCacheTable.get(context.build)!;

    if (!GlobalTable.has(compilation)) {
      GlobalTable.set(compilation, vmGlobal);
    }
    this.vmGlobal = GlobalTable.get(compilation);

    if (!VMContextTable.has(compilation)) {
      VMContextTable.set(compilation, vmContext);
    }
    this.vmContext = VMContextTable.get(compilation);
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
        this.compilation.buildQueue.add(webpackModule, (err, module) => {
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

    return this.instantiate({
      context,
      filename,
      source,
    });
  }

  protected abstract instantiate(module: Module): Promise<InstantiatedModule>;

  protected lookup(filename: string): Promise<InstantiatedModule> | undefined {
    return this.globalModules[filename] ?? this.modules[filename];
  }

  /**
   * Loads a module from the filesystem
   * @param filename
   */
  async load(context: string, request: string): Promise<InstantiatedModule> {
    const reference = await this.resolver.resolve(context, request);

    const module = this.lookup(reference.filename);

    if (module) {
      return module;
    }

    const resolver = createResolver<InstantiatedModule>();
    this.modules[reference.filename] = resolver;

    try {
      if (!context) {
        throw new Error('invalid context');
      }
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

  async require(context: string, request: string): Promise<InstantiatedModule> {
    const reference = await this.resolver.resolve(context, request);

    const module = this.lookup(reference.filename);
    if (module) {
      return module;
    }

    if (reference.compile) {
      return this.load(context, request);
    }

    const resolver = createResolver<InstantiatedModule>();
    this.globalModules[reference.filename] = resolver;

    try {
      (global as any).PagesModuleLoader = this;
      const exports = await import(reference.filename);
      // delete (global as any).PagesModuleLoader;

      let usedExports: string[];

      if (reference.loader === ModuleLoaderType.esm) {
        usedExports = Object.keys(exports);
      } else {
        usedExports = [
          ...new Set([
            'default',
            ...(isPlainObject(exports) ? Object.keys(exports) : []),
          ]),
        ];
      }

      const vmModule = new vm.SyntheticModule(
        usedExports,
        function (this: any) {
          if (isPlainObject(exports)) {
            usedExports.forEach(name => {
              if (name === 'default' && !('default' in exports)) {
                this.setExport('default', exports);
              } else {
                this.setExport(name, exports[name]);
              }
            });
          } else {
            this.setExport('default', exports);
          }
        },
        {
          context: this.vmContext,
        }
      );

      await vmModule.link(() => {});
      await vmModule.evaluate();

      resolver.resolve({
        context: path.dirname(reference.filename),
        filename: reference.filename,
        source: '',
        vmModule,
        exports,
      });
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

    return this.instantiate({
      context,
      filename,
      source,
    });
  }
}
