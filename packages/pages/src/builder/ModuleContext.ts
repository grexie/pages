import EventEmitter from 'events';
import { BuildContext } from './BuildContext';
import { Cache, ICache, Stats } from '@grexie/builder';
import webpack, { Compilation, Module as WebpackModule } from 'webpack';
import { Module as NodeModule, createRequire } from 'module';
import { ModuleCompiler } from './ModuleCompiler';
import {
  Module as _Module,
  createContext,
  SourceTextModule,
  SyntheticModule,
  Script,
} from 'vm';
import path from 'path';
import {
  createResolver,
  PromiseQueue,
  ResolvablePromise,
} from '../utils/resolvable';
import { promisify } from '../utils/promisify';
import { KeyedMutex } from '../utils/mutex';
import { isPlainObject } from '../utils/object';

const __dirname = path.dirname(new URL(import.meta.url).pathname);

const { ModuleDependency } = webpack.dependencies;

type WrappedScript = (
  exports: any,
  require: NodeJS.Require,
  module: NodeModule,
  __filename: string,
  __dirname: string
) => void;

const wrapScript = (code: string): string =>
  `(exports, require, module, __filename, __dirname) => {\n${code}\n}`;

const containsPath = (root: string, p: string) => {
  const relative = path.relative(root, p);
  return (
    !relative ||
    (!!relative && !relative.startsWith('..') && !path.isAbsolute(relative))
  );
};

interface Import {
  readonly compile?: boolean;
  readonly esm?: boolean;
  readonly builtin?: boolean;
  readonly filename: string;
}

type ModuleLoader = () => Promise<_Module>;

export interface ModuleOptions {
  context: ModuleContext;
  filename: string;
  loader: ModuleLoader;
  imports: Record<string, Import>;
  stats: Stats;
  webpackModule: WebpackModule;
  ready: ResolvablePromise<void>;
}

export interface ModuleEvictOptions {
  recompile?: boolean;
  fail?: boolean;
}

export class Module extends EventEmitter {
  readonly #context: ModuleContext;
  readonly filename: string;
  readonly load: ModuleLoader;
  readonly imports: Readonly<Record<string, Import>>;
  readonly stats: Stats;
  readonly webpackModule: WebpackModule;
  #module?: _Module;
  #previousMtime: number | undefined;
  readonly #previousDependencies: Set<string> = new Set();
  readonly #currentDependencies: Set<string> = new Set();
  readonly #dependents: Set<string> = new Set();
  readonly #evict: ResolvablePromise<{ finish: ResolvablePromise<void> }> =
    createResolver();

  #persisted: boolean = false;

  static #id = 0;
  readonly id = ++Module.#id;

  constructor({
    context,
    filename,
    loader,
    imports,
    stats,
    webpackModule,
    ready,
  }: ModuleOptions) {
    super();
    this.#context = context;
    this.stats = stats;
    this.webpackModule = webpackModule;
    this.filename = filename;
    this.load = async () => {
      this.#module = await loader();
      (this.#module as any).moduleInfo = this;
      return this.#module;
    };
    this.imports = imports;

    this.#initialize().then(ready.resolve, ready.reject);
  }

  get #metaCacheKey() {
    return `${this.filename}.meta.json`;
  }

  async persist() {
    if (this.#persisted) {
      return;
    }
    this.#persisted = true;

    const hasDifferences = (a: Set<string>, b: Set<string>) => {
      for (const s of b) {
        if (!a.has(s)) {
          return true;
        }
      }
      for (const s of a) {
        if (!b.has(s)) {
          return true;
        }
      }
      return false;
    };

    if (
      !hasDifferences(this.#previousDependencies, this.#currentDependencies) &&
      this.#previousMtime === this.mtime
    ) {
      return;
    }

    const cacheKey = this.#metaCacheKey;
    await Promise.all([
      this.#context.cache.lock(cacheKey, async cache => {
        const dependencies = Array.from(this.dependencies.values());
        const mtime = this.mtime;

        await cache.set(
          cacheKey,
          JSON.stringify({ dependencies, mtime }, null, 2),
          this.stats.mtime
        );
      }),
      ...this.dependencies.map(async dependency => {
        const module = await this.#context.modules[dependency];
        if (module) {
          await module.load();
          await module.persist();
        }
      }),
    ]);
  }

  async #initialize() {
    const cacheKey = this.#metaCacheKey;
    await this.#context.cache
      .lock(cacheKey, async cache => {
        const cached = await cache.get(cacheKey);
        const { dependencies, mtime } = JSON.parse(cached.toString()) as {
          dependencies: string[];
          mtime: number;
        };
        dependencies.forEach(dependency =>
          this.#previousDependencies.add(dependency)
        );
        this.#previousMtime = mtime;
      })
      .catch(() => {});

    this.#evict.then(({ finish }) =>
      this.persist().then(finish.resolve, finish.reject)
    );
  }

  addDependency(module: Module) {
    this.#currentDependencies.add(module.filename);
    module.#dependents.add(this.filename);
    this.#persisted = false;
  }

  get mtime() {
    return this.stats.mtimeMs;
  }

  get dependents() {
    return Array.from(this.#dependents);
  }

  get dependencies() {
    return Array.from(this.#currentDependencies);
  }

  get module() {
    if (!this.#module) {
      this.load();
    }

    return this.#module!;
  }

  get exports(): any {
    return this.module.namespace;
  }

  static async evict(
    factory: ModuleFactory,
    filename: string,
    { recompile = false }: ModuleEvictOptions
  ) {
    if (recompile) {
      await factory.context.cache
        .lock([filename, `${filename}.imports.json`], cache => {
          delete factory.context.loadedModules[filename];
          delete factory.context.modules[filename];

          return Promise.all([
            cache.remove(filename),
            cache.remove(`${filename}.imports.json`),
          ]);
        })
        .catch(() => {});
    } else {
      delete factory.context.loadedModules[filename];
      delete factory.context.modules[filename];
    }
  }

  async evict(
    factory: ModuleFactory,
    { recompile = false }: ModuleEvictOptions = {}
  ) {
    const promises: Promise<any>[] = [];
    await this.persist();
    await Module.evict(factory, this.filename, { recompile });

    promises.push(
      ...this.dependents.map(dependent =>
        this.#context.loadedModules[dependent]?.evict(factory)
      )
    );

    await Promise.all(promises);
    const finish = createResolver();
    this.#evict.resolve({ finish });
    await finish;
    this.emit('evict', this);
  }
}

export interface CompiledModule {
  source: string;
  webpackModule: WebpackModule;
}

export class ModuleFactory {
  readonly context: ModuleContext;
  readonly #resolve;
  readonly compilation;

  constructor(context: ModuleContext, compilation: Compilation) {
    this.context = context;
    this.compilation = compilation;

    const resolver = compilation.resolverFactory.get('loader', {
      fileSystem: compilation.compiler.inputFileSystem,
      conditionNames: ['default', 'require', 'import'],
      mainFields: ['module', 'main'],
      extensions: ['.md', '.js', '.jsx', '.ts', '.tsx', '.cjs', '.mjs'],
      alias: {
        '@grexie/pages': this.context.build.pagesDir,
      },
      modules: context.build.modulesDirs,
    });
    this.#resolve = resolver.resolve.bind(resolver);
  }

  async resolve(
    context: string,
    request: string
  ): Promise<{ filename: string; descriptionFile?: string }> {
    return new Promise((resolve, reject) =>
      this.#resolve({}, context, request, {}, (err, result, request) => {
        if (err) {
          reject(err);
          return;
        }

        if (typeof result !== 'string') {
          reject(new Error('not found'));
        }

        resolve({
          filename: result as string,
          descriptionFile: request?.descriptionFilePath,
        });
      })
    );
  }

  filename(request: string): string {
    return request.replace(/.*\!/g, '');
  }

  dirname(request: string): string {
    return path.dirname(this.filename(request));
  }

  async resolveImports(
    context: string,
    imports: string[],
    resolveDescendants: boolean = false
  ): Promise<Record<string, Import>> {
    const out = await Promise.all(
      imports.map(async request =>
        this.context.resolver.resolve(this, context, request)
      )
    );

    const resolved = out.reduce((a, b) => ({ ...a, ...b }), {});

    if (resolveDescendants) {
      await Promise.all(
        Object.entries(resolved)
          .filter(([, { compile }]) => !compile)
          .map(async ([request, descendantResolved]) => {
            const { builtin, filename } = descendantResolved;

            if (builtin) {
              return;
            }

            const { source } = await this.load(context, filename);

            if (!source) {
              return;
            }

            const { imports } = await this.compile(
              path.dirname(filename),
              source,
              filename,
              filename,
              false
            );
            const compile = Object.values(imports).reduce(
              (a, b) => a || (b.compile ?? false),
              false
            );
            resolved[request] = {
              ...resolved[request],
              compile,
            };
          })
      );
    }

    return resolved;
  }

  async load(context: string, filename: string): Promise<CompiledModule> {
    if (this.context.compilations[filename]) {
      return this.context.compilations[filename]!;
    }

    const resolver = createResolver<CompiledModule>();
    this.context.compilations[filename] = resolver;

    let phase = '';
    const interval = setInterval(() => {
      if (process.env.PAGES_DEBUG_LOADERS === 'true') {
        console.info('module-context:loading', phase, filename);
      }
    }, 5000);

    try {
      phase = 'create-module';
      const webpackModule = await new Promise<WebpackModule>(
        (resolve, reject) =>
          this.compilation.params.normalModuleFactory.create(
            {
              context,
              contextInfo: {
                issuer: 'pages',
                compiler: 'javascript/auto',
              },
              dependencies: [new ModuleDependency(filename)],
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

      phase = 'build-module';
      await new Promise((resolve, reject) =>
        this.compilation.buildModule(webpackModule, (err, result) => {
          if (err) {
            reject(err);
            return;
          }

          resolve(result);
        })
      );
      phase = '';

      phase = 'built-module';

      if (webpackModule.getNumberOfErrors()) {
        throw Array.from(webpackModule.getErrors() as any)[0];
      }

      const source = webpackModule.originalSource()?.buffer().toString();

      if (typeof source !== 'string') {
        throw new Error(`unable to load module ${filename}`);
      }

      resolver.resolve({ source, webpackModule });
    } catch (err) {
      resolver.reject(err);
    } finally {
      delete this.context.compilations[filename];
      clearInterval(interval);
    }

    return resolver;
  }

  #getCacheNames(filename: string) {
    const cacheFile = filename;
    const cacheImportsFile = `${cacheFile}.imports.json`;

    return { cacheFile, cacheImportsFile };
  }

  async getCompileCache(
    filename: string,
    sourceFilename: string,
    cache: ICache = this.context.cache
  ) {
    const { cacheFile, cacheImportsFile } = this.#getCacheNames(filename);

    return cache.lock([cacheFile, cacheImportsFile], async (cache: ICache) => {
      let stats;
      if (/!/.test(filename)) {
        stats = await Promise.all(
          filename
            .split(/\!/g)
            .filter(x => !!x)
            .map(loader =>
              this.context.build.fs.stat(loader.replace(/\?.*/, ''))
            )
        );
      } else {
        stats = [await this.context.build.fs.stat(sourceFilename)];
      }

      if (await cache.has(cacheFile)) {
        const cached = await cache.modified(cacheFile);

        if (
          stats.reduce(
            (a, b) => a || b.mtime.getTime() <= cached.getTime(),
            false
          )
        ) {
          const [vmSource, imports] = await Promise.all([
            cache.get(cacheFile).then((data: Buffer) => data.toString()),
            cache
              .get(cacheImportsFile)
              .then(
                (data: Buffer) =>
                  JSON.parse(data.toString()) as Record<string, Import>
              ),
          ]);

          return {
            cached: true,
            vmSource,
            imports,
            stats: stats[stats.length - 1],
          };
        }
      }

      return { cached: false, stats: stats[stats.length - 1] };
    });
  }

  async compile(
    context: string,
    source: string,
    filename: string,
    sourceFilename: string,
    resolveImportsDescendants: boolean = false,
    cache: ICache = this.context.cache
  ) {
    const { cacheFile, cacheImportsFile } = this.#getCacheNames(filename);

    return cache.lock([cacheFile, cacheImportsFile], async (cache: ICache) => {
      const cached = await this.getCompileCache(
        filename,
        sourceFilename,
        cache
      );
      if (cached.cached) {
        return {
          stats: cached.stats,
          vmSource: cached.vmSource!,
          imports: cached.imports!,
        };
      }

      const compiled = await this.context.compiler.compile({
        source: source,
        filename,
      });

      const imports = await this.resolveImports(
        context,
        compiled.imports,
        resolveImportsDescendants
      );

      await Promise.all([
        cache.set(
          cacheImportsFile,
          JSON.stringify(imports),
          cached.stats.mtime
        ),
      ]);

      return { stats: cached.stats, imports };
    });
  }
}

export interface ModuleResolverOptions {
  extensions?: string[];
  forceCompile?: string[];
  forceExtensions?: string[];
  esm?: string[];
}

export class ModuleResolver {
  readonly context: ModuleContext;
  readonly #forceCompile: string[];
  readonly #extensions: string[];
  readonly #forceExtensions: string[];
  readonly #esm: string[];
  readonly #descriptions: Record<string, any> = {};
  readonly #require: NodeRequire;

  constructor({
    context,
    extensions = [],
    forceCompile = [],
    forceExtensions = [],
    esm = [],
  }: ModuleResolverOptions & { context: ModuleContext }) {
    this.#require = createRequire(import.meta.url);
    this.context = context;
    this.#forceCompile = Array.from(new Set([...forceCompile]));
    this.#extensions = Array.from(
      new Set(['.js', '.cjs', '.mjs', ...extensions])
    );
    this.#forceExtensions = Array.from(new Set([...forceExtensions]));
    this.#esm = [...new Set(['.mjs', ...esm])];
  }

  async #buildImport(
    factory: ModuleFactory,
    request: string,
    filename: string,
    {
      compile = false,
      builtin = false,
      esm = this.#esm.reduce((a, b) => a || filename.endsWith(b), false),
      descriptionFile,
    }: {
      compile?: boolean;
      builtin?: boolean;
      esm?: boolean;
      descriptionFile?: string;
    } = {}
  ) {
    if (!esm && descriptionFile) {
      const json = await this.#getDescriptionFile(factory, descriptionFile);

      if (json.type === 'module' || json.module) {
        esm = true;
      }
    }

    let o = { filename, esm } as any;

    if (compile) {
      o.compile = true;
    }

    if (builtin) {
      o.builtin = true;
    }

    return { [request]: o };
  }

  async #getDescriptionFile(
    factory: ModuleFactory,
    descriptionFile: string
  ): Promise<any> {
    if (!this.#descriptions[descriptionFile]) {
      const fs = factory.compilation.compiler.inputFileSystem;
      const readFile = promisify(fs, fs.readFile!);

      const description =
        this.#descriptions[descriptionFile] ??
        JSON.parse((await readFile(descriptionFile)).toString());
      this.#descriptions[descriptionFile] = description;
    }

    return this.#descriptions[descriptionFile];
  }

  async resolve(
    factory: ModuleFactory,
    context: string,
    request: string
  ): Promise<Record<string, Import>> {
    const fs = factory.compilation.compiler.inputFileSystem;
    const realpath = promisify(fs, fs.realpath!);
    const stat = promisify(fs, fs.stat);

    if (/\!/.test(request)) {
      const requests = request.split(/\!/g);
      const result = (
        await Promise.all(
          requests.map(async requestParams => {
            const [requestPart, query] = requestParams.split('?', 2);
            if (requestPart) {
              return {
                ...(await this.resolve(factory, context, requestPart))[
                  requestPart
                ],
                query,
              };
            } else {
              return { filename: '', query };
            }
          })
        )
      )
        .map(
          result =>
            `${result.filename ? result.filename : ''}${
              result.query ? '?' : ''
            }${result.query ? result.query : ''}`
        )
        .join('!');

      return this.#buildImport(factory, request, result, { compile: true });
    }

    let resolved: { filename: string; descriptionFile?: string };
    try {
      resolved = await factory.resolve(context, request);
    } catch (err) {
      return this.#buildImport(factory, request, request, { builtin: true });
    }
    resolved.filename = await realpath(resolved.filename);
    if (resolved.descriptionFile) {
      resolved.descriptionFile = await realpath(resolved.descriptionFile);
    }
    const { descriptionFile } = resolved;

    if (
      resolved.filename ===
      this.#require.resolve(
        path.resolve(this.context.build.pagesDir, 'defaults.pages.mjs')
      )
    ) {
      return this.#buildImport(factory, request, resolved.filename, {
        compile: true,
        descriptionFile,
      });
    }

    if (
      this.#forceExtensions.reduce(
        (a, b) => a || resolved.filename.endsWith(b),
        false
      )
    ) {
      return this.#buildImport(factory, request, resolved.filename, {
        compile: true,
        descriptionFile,
      });
    } else if (
      !this.#extensions.reduce(
        (a, b) => a || resolved.filename.endsWith(b),
        false
      )
    ) {
      return this.#buildImport(factory, request, resolved.filename, {
        compile: true,
        descriptionFile,
      });
    }

    const roots = await Promise.all(
      this.#forceCompile.map(async module => {
        const filename = path.resolve(context, module);
        try {
          await stat(filename);
          return filename;
        } catch (err) {
          const resolved = await factory.resolve(context, module);
          if (!resolved.descriptionFile) {
            throw new Error(
              `couldn't resolve description file for root ${module}`
            );
          }
          return path.dirname(resolved.descriptionFile);
        }
      })
    );

    if (
      !containsPath(
        path.resolve(this.context.rootDir, 'node_modules'),
        resolved.filename
      )
    ) {
      if (
        roots.reduce((a, b) => a || containsPath(b, resolved.filename), false)
      ) {
        return this.#buildImport(factory, request, resolved.filename, {
          compile: true,
          descriptionFile,
        });
      }
    }

    return this.#buildImport(factory, request, resolved.filename, {
      descriptionFile,
    });
  }
}

export interface ModuleContextOptions {
  context: BuildContext;
  resolver?: ModuleResolverOptions;
}

const vmContext = createContext({ process });

export class ModuleContext {
  readonly build: BuildContext;
  readonly cache: Cache;
  readonly compiler: ModuleCompiler;
  readonly compilations: Record<string, Promise<CompiledModule> | undefined> =
    {};
  readonly modules: Record<string, Promise<Module> | undefined> = {};
  readonly loadedModules: Record<string, Module> = {};
  readonly locks = new KeyedMutex({ watcher: true });
  readonly resolver: ModuleResolver;
  readonly #builds: Record<string, PromiseQueue> = {};
  readonly #vmContext = vmContext;

  constructor({ context, resolver = {} }: ModuleContextOptions) {
    this.build = context;
    this.resolver = new ModuleResolver({ context: this, ...resolver });
    this.cache = this.build.cache.create('modules');
    this.compiler = new ModuleCompiler({ context: this });
  }

  get rootDir() {
    return this.build.rootDir;
  }

  async meta(filename: string) {
    if (this.modules[filename]) {
      const { dependencies, dependents, mtime } = await this.modules[filename]!;
      return { dependencies, dependents, mtime };
    }

    const cacheKey = `${filename}.meta.json`;

    return await this.cache.lock(cacheKey, async cache => {
      try {
        const json = await cache.get(cacheKey);
        return JSON.parse(json.toString()) as {
          dependencies: string[];
          dependents: string[];
          mtime: number;
        };
      } catch (err) {
        return undefined;
      }
    });
  }

  async addBuild(filename: string, promise: Promise<void>) {
    if (!this.#builds[filename]) {
      if (process.env.PAGES_DEBUG_LOADERS === 'true') {
        console.info('build', filename);
      }
      this.#builds[filename] = new PromiseQueue();
      this.#builds[filename].finally(() => {
        if (process.env.PAGES_DEBUG_LOADERS === 'true') {
          console.info('build:finished', filename);
        }
        delete this.#builds[filename];
      });
    }

    await this.#builds[filename].add(promise);
  }

  createModuleFactory(compilation: Compilation) {
    return new ModuleFactory(this, compilation);
  }

  async evict(
    factory: ModuleFactory,
    filename: string,
    { recompile = false, fail = true }: ModuleEvictOptions = {}
  ) {
    const module = this.loadedModules[filename];
    if (fail && !module) {
      throw new Error(`failed to evict ${filename}: not loaded`);
    }
    if (!module) {
      Module.evict(factory, filename, { recompile, fail });
    }
    await module?.evict(factory, { recompile, fail });
  }

  async require(factory: ModuleFactory, context: string, request: string) {
    const { [request]: require } = await this.resolver.resolve(
      factory,
      context,
      request
    );
    const { filename } = require;

    if (this.modules[filename]) {
      const { cached } = await factory.getCompileCache(filename, filename);
      const cachedModule = this.modules[filename];
      if (cached && cachedModule) {
        const module = await cachedModule;
        return module;
      }
    }

    const { source, webpackModule } = await factory.load(context, filename);

    const module = await this.create(
      factory,
      webpackModule,
      filename,
      source,
      filename,
      require
    );
    return module;
  }

  async #createSyntheticImportModule(factory: ModuleFactory, filename: string) {
    console.info('creating synthetic import module', filename);

    const exports = await import(filename);

    if (/runtime\/styles/.test(filename)) {
      console.info(
        Object.keys(exports),
        isPlainObject(exports),
        Object.getPrototypeOf(exports)
      );
    }

    const module = new SyntheticModule(
      [...Object.keys(exports)],
      function (this: any) {
        Object.keys(exports).forEach(name => {
          this.setExport(name, exports[name]);
        });
      },
      {
        context: this.#vmContext,
      }
    );

    await module.link(() => {});
    await module.evaluate();

    return module;
  }

  async #createSyntheticModule(
    factory: ModuleFactory,
    context: string,
    filename: string,
    specifier: string,
    resolved?: Import
  ) {
    let exports: any;

    if (!resolved || resolved.builtin || !resolved.compile) {
      if (resolved?.esm) {
        return this.#createSyntheticImportModule(
          factory,
          resolved?.filename ?? specifier
        );
      } else {
        const require = createRequire(filename);
        exports = require(resolved?.filename ?? specifier);
      }
    } else {
      const context = path.dirname(resolved.filename);

      const source = await factory.load(context, resolved.filename);

      if (resolved.esm) {
        const compiled = await factory.compile(
          context,
          source.source,
          resolved.filename,
          resolved.filename,
          true,
          this.cache
        );

        console.info(resolved.filename, compiled.imports);

        return this.#createSourceTextModule(
          factory,
          source.source,
          context,
          resolved.filename,
          compiled.imports
        );
      }

      const script = new Script(wrapScript(source.source), {
        filename: resolved.filename,
        displayErrors: true,
      }).runInContext(this.#vmContext) as WrappedScript;

      const _module = new NodeModule(resolved.filename);
      _module.require = createRequire(resolved.filename);

      script(
        _module.exports,
        _module.require,
        _module,
        resolved!.filename,
        path.dirname(resolved!.filename)
      );

      exports = _module.exports;
    }

    const module = new SyntheticModule(
      [
        ...new Set([
          'default',
          ...(isPlainObject(exports) ? Object.keys(exports) : []),
        ]),
      ],
      function (this: any) {
        if (isPlainObject(exports)) {
          Object.keys(exports).forEach(name => {
            this.setExport(name, exports[name]);
          });
          if (!('default' in exports)) {
            this.setExport('default', exports);
          }
        } else {
          this.setExport('default', exports);
        }
      },
      {
        context: this.#vmContext,
      }
    );

    await module.link(() => {});
    await module.evaluate();

    return module;
  }

  async #createSourceTextModule(
    factory: ModuleFactory,
    source: string,
    context: string,
    filename: string,
    imports: Record<string, Import>
  ) {
    const sourceTextModule = new SourceTextModule(source, {
      context: this.#vmContext,
      initializeImportMeta: () => {},
      identifier: filename,
      importModuleDynamically: async specified => {
        const m = await this.require(factory, context, specified);
        await m.load();
        return m.module;
      },
    });

    await sourceTextModule.link((async (specifier: string) => {
      const resolved = imports[specifier]!;

      if (!resolved) {
        console.info(imports, specifier);
      }

      let modulePromise = this.modules[resolved?.filename ?? specifier];

      if (modulePromise) {
        const module = await modulePromise;
        await module.load();
        return module.module;
      }

      const resolver = createResolver<Module>();
      this.modules[resolved?.filename ?? specifier] = resolver;

      console.info(
        'linking to synthetic module',
        filename,
        resolved,
        specifier,
        imports
      );
      const syntheticModule = await this.#createSyntheticModule(
        factory,
        context,
        filename,
        specifier,
        resolved
      );

      const ready = createResolver();
      const module = new Module({
        context: this,
        filename: resolved.filename,
        loader: () => Promise.resolve(syntheticModule),
        imports: {},
        stats: { mtime: new Date(0), mtimeMs: 0 } as any,
        webpackModule: null as any,
        ready,
      });

      await ready;
      this.loadedModules[filename] = module;

      resolver.resolve(module);
      return syntheticModule;
    }) as any);

    await sourceTextModule.evaluate({});
    return sourceTextModule;
  }

  async create(
    factory: ModuleFactory,
    webpackModule: WebpackModule,
    filename: string,
    source: string,
    sourceFilename: string = filename,
    imported?: Import,
    seen: Set<string> = new Set()
  ): Promise<Module> {
    const loadingModule = this.modules[filename];
    if (loadingModule) {
      return await loadingModule;
    }

    const context = path.dirname(filename);
    const promise = createResolver<Module>();

    this.modules[filename] = promise;

    if (!imported) {
      const { [filename]: _imported } = await this.resolver.resolve(
        factory,
        context,
        filename
      );
      imported = _imported;
    }

    const { stats, imports } = await factory.compile(
      context,
      source,
      filename,
      sourceFilename,
      true,
      this.cache
    );

    const next = async (require: Import): Promise<string[]> => {
      if (require.filename === filename) {
        return [];
      }
      if (seen.has(require.filename)) {
        return [require.filename];
      }
      seen.add(require.filename);

      await this.#builds[require.filename];

      if (this.modules[require.filename]) {
        const module = await this.modules[require.filename]!;

        const modules = await Promise.all(
          Object.values(module.imports).map(require => next(require))
        );

        return [
          require.filename,
          ...modules.reduce((a, b) => [...(a ?? []), ...(b ?? [])], []),
        ];
      }

      if (require.builtin) {
        return [require.filename];
      }

      const { source, webpackModule } = await factory.load(
        context,
        require.filename
      );
      await this.create(
        factory,
        webpackModule,
        require.filename,
        source,
        factory.filename(require.filename),
        require,
        new Set()
      );
      return [require.filename];
    };

    const modules = await Promise.all(Object.values(imports).map(next));

    let _module: Promise<_Module>;
    const loader = async (): Promise<_Module> => {
      if (_module) {
        return _module;
      }

      const resolver = createResolver<_Module>();
      _module = resolver;

      try {
        console.info(imported, imports);
        if (imported!.esm && imported!.compile) {
          const sourceTextModule = await this.#createSourceTextModule(
            factory,
            source,
            context,
            filename,
            imports
          );

          resolver.resolve(sourceTextModule);
          return sourceTextModule;
        } else {
          const syntheticModule = await this.#createSyntheticModule(
            factory,
            context,
            filename,
            imported!.filename,
            imported!
          );

          resolver.resolve(syntheticModule);
          return syntheticModule;
        }
      } catch (err) {
        resolver.reject(err);
        console.error(err);
        process.exit(1);
        throw err;
      }
    };

    const ready = createResolver();
    const module = new Module({
      context: this,
      filename,
      loader,
      imports,
      stats,
      webpackModule,
      ready,
    });

    await ready;
    this.loadedModules[filename] = module;
    function promiseState(p?: PromiseLike<any>) {
      const t = {};
      return Promise.race([p, t]).then(
        v => (v === t ? 'pending' : 'fulfilled'),
        () => 'rejected'
      );
    }

    await Promise.all(
      modules
        .reduce((a, b) => [...a, ...b], [])
        .map(module => this.modules[module])
    );
    promise.resolve(module);
    return module;
  }
}
