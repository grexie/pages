import { EventEmitter } from 'events';
import { BuildContext } from './BuildContext';
import { Cache, ICache, Stats } from '@grexie/builder';
import webpack, { Compilation, Module as WebpackModule } from 'webpack';
import _Module from 'module';
import { ModuleCompiler } from './ModuleCompiler';
import { Script } from 'vm';
import path from 'path';
import {
  createResolver,
  PromiseQueue,
  ResolvablePromise,
} from '../utils/resolvable';
import { promisify } from '../utils/promisify';
import { KeyedMutex } from '../utils/mutex';

const { ModuleDependency } = webpack.dependencies;

type WrappedScript = (
  exports: any,
  require: NodeJS.Require,
  module: _Module,
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

const cloneRequire = (
  original: _Module,
  fn: (request: string) => any
): NodeRequire => {
  const require = fn as NodeRequire;
  require.resolve = original.require.resolve;
  require.main = original.require.main;
  require.cache = original.require.cache;
  require.extensions = original.require.extensions;
  return require;
};

interface Import {
  readonly compile?: boolean;
  readonly builtin?: boolean;
  readonly filename: string;
}

type ModuleLoader = (parent: _Module) => _Module;

export interface ModuleOptions {
  context: ModuleContext;
  filename: string;
  source: string;
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
  readonly source: string;
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
    source,
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
    this.source = source;
    this.load = (parent: _Module) => {
      this.#module = loader(parent);
      (this.#module! as any).moduleInfo = this;
      return this.#module;
    };
    this.imports = imports;

    this.#initialize().then(ready.resolve, ready.reject);
  }

  get #metaCacheKey() {
    return `${this.filename}.meta.json`;
  }

  async persist() {
    if (!this.#module) {
      this.load(module);
    }

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
          module.load(this.module);
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
      throw new Error(`module ${this.filename} not loaded, did you call load?`);
    }

    return this.#module;
  }

  get exports() {
    return this.module.exports;
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
    delete this.#module?.require.cache[this.filename];

    promises.push(
      ...this.dependents.map(dependent =>
        this.#context.loadedModules[dependent]?.evict(factory)
      )
    );

    await Promise.all(promises);
    const finish = createResolver();
    this.#evict.resolve({ finish });
    await finish;
    this.emit('evict', module);
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
      mainFields: ['main', 'module'],
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
          const [source, imports] = await Promise.all([
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
            source,
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
    _source: string,
    filename: string,
    sourceFilename: string,
    resolveImportsDescendants: boolean = true,
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
          source: cached.source!,
          imports: cached.imports!,
        };
      }

      const compiled = await this.context.compiler.compile({
        source: _source,
        filename,
      });
      const source = compiled.source;

      const imports = await this.resolveImports(
        context,
        compiled.imports,
        resolveImportsDescendants
      );

      await Promise.all([
        cache.set(cacheFile, source, cached.stats.mtime),
        cache.set(
          cacheImportsFile,
          JSON.stringify(imports),
          cached.stats.mtime
        ),
      ]);

      return { stats: cached.stats, source, imports };
    });
  }
}

export interface ModuleResolverOptions {
  extensions?: string[];
  forceCompile?: string[];
  forceExtensions?: string[];
}

export class ModuleResolver {
  readonly context: ModuleContext;
  readonly #forceCompile: string[];
  readonly #extensions: string[];
  readonly #forceExtensions: string[];
  readonly #descriptions: Record<string, any> = {};

  constructor({
    context,
    extensions = [],
    forceCompile = [],
    forceExtensions = [],
  }: ModuleResolverOptions & { context: ModuleContext }) {
    this.context = context;
    this.#forceCompile = Array.from(
      new Set([this.context.rootDir, ...forceCompile])
    );
    this.#extensions = Array.from(
      new Set(['.js', '.cjs', '.mjs', ...extensions])
    );
    this.#forceExtensions = Array.from(new Set(['.mjs', ...forceExtensions]));
  }

  #buildImport(
    request: string,
    filename: string,
    compile: boolean = true,
    builtin: boolean = false
  ) {
    let o: Import;
    if (compile) {
      o = { compile, filename };
    } else if (builtin) {
      o = { builtin, filename };
    } else {
      o = { filename };
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

      return this.#buildImport(request, result, true, false);
    }

    let resolved: { filename: string; descriptionFile?: string };
    try {
      resolved = await factory.resolve(context, request);
    } catch (err) {
      return this.#buildImport(request, request, false, true);
    }
    resolved.filename = await realpath(resolved.filename);
    if (resolved.descriptionFile) {
      resolved.descriptionFile = await realpath(resolved.descriptionFile);
    }

    if (
      resolved.filename ===
      require.resolve(
        path.resolve(this.context.build.pagesDir, 'defaults.pages')
      )
    ) {
      return this.#buildImport(request, resolved.filename, true);
    }

    const extension = path.extname(resolved.filename);
    if (this.#forceExtensions.includes(extension)) {
      return this.#buildImport(request, resolved.filename);
    } else if (!this.#extensions.includes(extension)) {
      return this.#buildImport(request, resolved.filename, false);
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
        return this.#buildImport(request, resolved.filename);
      }
    }

    if (containsPath(path.resolve(__dirname, '..'), resolved.filename)) {
      return this.#buildImport(request, resolved.filename, false);
    }

    if (resolved.descriptionFile) {
      const description = await this.#getDescriptionFile(
        factory,
        resolved.descriptionFile
      );

      if (description.type === 'module') {
        return this.#buildImport(request, resolved.filename);
      }
    }

    return this.#buildImport(request, resolved.filename, false);
  }
}

export interface ModuleContextOptions {
  context: BuildContext;
  resolver?: ModuleResolverOptions;
}

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

  addBuild(filename: string, promise: Promise<void>) {
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

    this.#builds[filename].add(promise);
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

  async require(
    factory: ModuleFactory,
    context: string,
    request: string,
    parent?: Module
  ) {
    const {
      [request]: { filename },
    } = await this.resolver.resolve(factory, context, request);

    if (this.modules[filename]) {
      const { cached } = await factory.getCompileCache(filename, filename);
      const cachedModule = this.modules[filename];
      if (cached && cachedModule) {
        const module = await cachedModule;
        parent?.addDependency(module);
        return module;
      }
    }

    const { source, webpackModule } = await factory.load(context, filename);

    const module = await this.create(factory, webpackModule, filename, source);
    parent?.addDependency(module);
    return module;
  }

  #createRequire(_module: _Module, _filename: string) {
    const _require = _module.require;
    const parentModule = this.loadedModules[_filename];

    _module.require = cloneRequire(_module, request => {
      const {
        compile = false,
        builtin = false,
        filename = request,
      } = parentModule?.imports[request] ?? {};

      if (!parentModule || builtin || !compile) {
        const exports = _require(filename);
        return exports;
      }

      const childModule = this.loadedModules[filename];
      parentModule.addDependency(childModule);
      const { exports } = childModule.load(_module);
      return exports;
    });

    return _module.require;
  }

  async create(
    factory: ModuleFactory,
    webpackModule: WebpackModule,
    filename: string,
    _source: string,
    sourceFilename: string = filename,
    seen: Set<string> = new Set()
  ): Promise<Module> {
    const loadingModule = this.modules[filename];
    if (loadingModule) {
      return await loadingModule;
    }

    const context = path.dirname(filename);
    const promise = createResolver<Module>();

    this.modules[filename] = promise;

    const { stats, source, imports } = await factory.compile(
      context,
      _source,
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

      if (!require.compile) {
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
        new Set()
      );
      return [require.filename];
    };

    const modules = await Promise.all(Object.values(imports).map(next));

    const script = new Script(wrapScript(source), {
      filename,
      displayErrors: true,
    }).runInThisContext() as WrappedScript;

    let _module: _Module;
    const loader = (parent: _Module) => {
      if (_module) {
        return _module;
      }

      const __filename = factory.filename(filename);
      const __dirname = factory.dirname(filename);

      _module = new _Module(__filename, parent);
      _module.require = _Module.createRequire(__filename);
      _module.require = this.#createRequire(_module, __filename);
      _module.require.cache[__filename] = _module;

      script(
        _module.exports,
        _module.require,
        _module,
        __filename,
        factory.dirname(__filename)
      );

      return _module;
    };

    const ready = createResolver();
    const module = new Module({
      context: this,
      filename,
      source,
      loader,
      imports,
      stats,
      webpackModule,
      ready,
    });

    await ready;
    this.loadedModules[filename] = module;

    await Promise.all(
      modules
        .reduce((a, b) => [...a, ...b], [])
        .map(module => this.modules[module])
    );
    promise.resolve(module);
    return module;
  }
}
