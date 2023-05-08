import {
  ContextOptions,
  Context,
  NormalizedMapping,
  Mapping,
} from '@grexie/pages/api';
import path from 'path';
import type { FileSystemOptions, WritableFileSystem } from './FileSystem.js';
import { Builder } from './Builder.js';
import {
  ProviderConfig,
  ProviderConstructor,
  ProviderOptions,
  Registry,
} from './Registry.js';
import { ModuleContext } from './ModuleContext.js';
import os from 'os';
import { ConfigContext } from './ConfigContext.js';
import { Volume } from 'memfs';
import { createRequire } from 'module';
import { Compiler, Compilation, EntryOptions } from 'webpack';
import type { ModuleResolverConfig } from './ModuleResolver.js';
import type { SourceContextOptions } from './SourceContext.js';
import { SourceContext } from './SourceContext.js';
import { Source } from './Source.js';
import resolve from 'enhanced-resolve';
import { createResolver } from '@grexie/resolvable';
import { Events, EventManager, EventPhase } from './EventManager.js';
import { PluginContext, Plugin, PluginHandler } from './PluginContext.js';
import { ICache } from './Cache.js';
import webpack from 'webpack';
import { Renderer } from './Renderer.js';
import { Provider } from './Provider.js';

const __filename = new URL(import.meta.url).pathname;
const __dirname = path.dirname(__filename);

export interface ChildBuildOptions {
  providers: ProviderConfig[];
  rootDir: string;
  mapping?: NormalizedMapping;
}

export interface ChildBuildContextOptions extends ChildBuildOptions {
  parent: BuildContext;
  compilation: Compilation;
}

export interface BuildOptions extends ContextOptions {
  providers?: ProviderConfig[];
  cacheKey?: string;
  cacheDir?: string;
  rootDir?: string;
  fs: WritableFileSystem;
  defaultFiles?: WritableFileSystem;
  fsOptions?: FileSystemOptions[];
  resolver?: ModuleResolverConfig;
}

const defaultOptions = ({
  cacheKey = 'default',
  fs,
}: BuildOptions): Required<BuildOptions> => ({
  providers: [],
  rootDir: path.resolve(process.cwd(), process.env.PAGES_ROOT ?? '.'),
  cacheKey,
  cacheDir: path.resolve(
    process.cwd(),
    process.env.PAGES_CACHE ??
      path.resolve(os.tmpdir(), '@grexie', 'pages', 'cache', cacheKey)
  ),
  fs,
  defaultFiles: new Volume() as WritableFileSystem,
  fsOptions: [],
  resolver: {},
});

export interface BuildContextOptions extends BuildOptions {}

export interface BuildContext extends Context {
  readonly parent?: BuildContext;
  readonly registry: Registry;
  readonly rootDir: string;
  readonly root: BuildContext;
  readonly cacheDir: string;
  readonly pagesDir: string;
  readonly outputDir: string;
  readonly modulesDirs: string[];
  readonly builder: Builder;
  readonly config: ConfigContext;
  readonly resolverConfig: Required<ModuleResolverConfig>;
  readonly ready: Promise<BuildContext>;
  readonly plugins?: Set<Plugin>;
  readonly defaultFiles: WritableFileSystem;
  readonly providerConfig: Partial<ProviderConfig>;
  readonly cache: ICache;
  readonly fs: WritableFileSystem;
  readonly compilation?: Compilation;
  readonly renderer: Renderer;
  readonly sources: SourceResolver;
  readonly mapping?: NormalizedMapping;

  dispose(): void;

  getModuleContext(compilation: Compilation): ModuleContext;
  createSourceContext(options: SourceContextOptions): SourceContext;
  addSourceExtension(...extensions: string[]): void;
  addConfigExtension(...extensions: string[]): void;
  addExcludeGlob(...globs: string[]): void;
  addCompilationRoot(...paths: string[]): void;
  addCompilationExcludeRoot(...paths: string[]): void;
  addResolveExtension(...extensions: string[]): void;
  addEsmExtension(...extensions: string[]): void;
  addCommonJSExtension(...extensions: string[]): void;
  addCompileExtension(...extensions: string[]): void;
}

const BuildContextTable = new WeakMap<Compilation, BuildContext>();

const SourceResolverTable = new WeakMap<BuildContext, SourceResolver>();

export class SourceResolver {
  readonly context: BuildContext;
  readonly children = new Set<SourceResolver>();
  // readonly mappings: Record<string, SourceResolver> = {};

  get parent(): SourceResolver | undefined {
    if (!this.context.parent) {
      return;
    }

    return SourceResolver.getInstance(this.context.parent);
  }

  createChild(compilation: Compilation, options: ChildBuildOptions) {
    return new ChildBuildContext({
      parent: this.context,
      compilation,
      ...options,
    });
  }

  isRootDir(value: string): boolean {
    let { rootDir } = this.context;
    if (rootDir[rootDir.length - 1] !== '/') {
      rootDir += '/';
    }
    if (
      value.startsWith(rootDir) &&
      !value.startsWith(path.resolve(rootDir, 'node_modules'))
    ) {
      return true;
    }

    if (
      this.context.resolverConfig.excludeCompileRoots.reduce(
        (a, b) => a || value.startsWith(b),
        false
      )
    ) {
      return false;
    }

    if (
      this.context.resolverConfig.forceCompileRoots.reduce(
        (a, b) => a || value.startsWith(b),
        false
      )
    ) {
      return true;
    }

    for (const resolver of this.children) {
      if (resolver.isRootDir(value)) {
        return true;
      }
    }
    return false;
  }

  get descendants() {
    const out: SourceResolver[] = [...this.children];

    for (const child of this.children) {
      out.push(...child.descendants);
    }

    return out;
  }

  get ancestors() {
    let out: SourceResolver[] = [];
    let el: SourceResolver | undefined = this;

    while ((el = el.parent)) {
      out.push(el!);
    }

    return out;
  }

  async getOutputSlug(source: Source): Promise<string> {
    // const sources = this.lookupMapping(source.path);
    // const { mapping }: { mapping?: NormalizedMapping } = sources?.context ?? {};
    // if (!sources || !mapping) {
    //   throw new Error('unable to find mapping for source');
    // }
    // const relativePath = path.resolve(
    //   ...mapping.to,
    //   path.relative(mapping.from, source.filename)
    // );
    // console.info(relativePath);
    return source.slug;
  }

  async getAllSources(): Promise<Source[]> {
    let stack: SourceResolver[] = [
      ...this.ancestors,
      this,
      ...this.descendants,
    ];
    let el: SourceResolver | undefined;

    let out: Source[] = [];

    while ((el = stack.shift())) {
      for (const source of await el.context.registry.list()) {
        const existingSource = out.find(({ slug }) => slug === source.slug);
        if (existingSource) {
          if (existingSource.priority < source.priority) {
            out.splice(out.indexOf(existingSource), 1, source);
          }
        } else {
          out.push(source);
        }
      }
    }

    return out;
  }

  async getSource({ path }: { path: string[] }): Promise<Source> {
    let stack: SourceResolver[] = [
      ...this.ancestors,
      this,
      ...this.descendants,
    ];
    let el: SourceResolver | undefined;

    let out = [];

    while ((el = stack.shift())) {
      out.push(...(await el.context.registry.list({ path })));
    }

    if (!out.length) {
      throw new Error(`unable to resolve ${JSON.stringify(path.join('/'))}`);
    }

    out.sort((a, b) => {
      if (a.priority > b.priority) {
        return -1;
      }

      if (a.priority < b.priority) {
        return 1;
      }

      return 0;
    });

    return out[0];
  }

  lookupMapping(path: string[]): SourceResolver | undefined {
    const to = this.context.mapping?.to;
    if (to) {
      for (let i = 0; i < to.length ?? 0; i++) {
        if (to[i] !== path[i]) {
          break;
        } else {
          if (i === to.length - 1) {
            return this;
          }
        }
      }
    }

    for (const sources of this.children) {
      const result = sources.lookupMapping(path);
      if (result) {
        return result;
      }
    }
  }

  lookupMappingFrom(filename: string): SourceResolver | undefined {
    for (const sources of this.children) {
      const result = sources.lookupMappingFrom(filename);
      if (result) {
        return result;
      }
    }

    const from = this.context.rootDir;

    if (from && filename.startsWith(from)) {
      return this;
    }
  }

  async resolve({ context, request }: { context: string[]; request: string }) {
    let path: string[];

    if (request.startsWith('/')) {
      const requestPath = request.substring(1).split(/\//g);
      path = requestPath;
    } else {
      const contextPath = context;
      const requestPath = request.split(/\//g).filter(x => !!x);
      if (requestPath[requestPath.length - 1] === 'index') {
        requestPath.pop();
      }

      while (requestPath.length) {
        if (requestPath[0] === '.') {
          requestPath.shift();
        } else if (requestPath[0] === '..') {
          if (!contextPath.length) {
            throw new Error(
              `unable to resolve request beyond root: request ${request} in context ${context}`
            );
          }
          contextPath.pop();
          requestPath.shift();
        } else {
          contextPath.push(requestPath.shift()!);
        }
      }
      path = contextPath;
    }

    let mapping = this.lookupMapping(path);
    if (mapping) {
      const source = await mapping.getSource({ path });
      return source;
    }

    const source = await this.getSource({ path });
    return source;
  }

  private constructor(context: BuildContext) {
    this.context = context;
  }

  static getInstance(context: BuildContext) {
    if (!SourceResolverTable.has(context)) {
      SourceResolverTable.set(context, new SourceResolver(context));
    }
    return SourceResolverTable.get(context)!;
  }
}

const ModuleContextTable = new WeakMap<Compiler, ModuleContext>();

export class RootBuildContext extends Context implements BuildContext {
  readonly registry: Registry;
  readonly rootDir: string;
  readonly cacheDir: string;
  readonly pagesDir: string;
  readonly outputDir: string;
  readonly modulesDirs: string[];
  readonly builder: Builder;
  readonly renderer: Renderer;
  readonly config: ConfigContext;
  readonly providerConfig: Partial<ProviderConfig> = {
    exclude: [],
    extensions: [],
    configExtensions: [],
  };
  #defaultFiles: WritableFileSystem = new Volume() as WritableFileSystem;
  readonly resolverConfig: Required<ModuleResolverConfig>;
  readonly #readyResolver = createResolver<BuildContext>();
  readonly ready = this.#readyResolver.finally(() => {});
  readonly #events = EventManager.get<BuildContext>(this as BuildContext);
  #plugins?: PluginContext;
  readonly sources = SourceResolver.getInstance(this as BuildContext);

  get plugins() {
    return this.#plugins?.plugins;
  }

  async addPlugin(name: string, handler: PluginHandler) {
    await this.ready;
    const plugin: Plugin = {
      name,
      handler,
    };
    this.#plugins!.plugins.add(plugin);
    const events = EventManager.get<BuildContext>(this).create(plugin.name);
    await plugin.handler(events);
  }

  get root(): BuildContext {
    return this;
  }

  constructor(
    options: BuildContextOptions & { builder?: Builder; isServer?: boolean }
  ) {
    const {
      rootDir,
      cacheDir,
      providers,
      fs,
      defaultFiles,
      fsOptions,
      resolver,
      builder,
      ...opts
    } = Object.assign(defaultOptions(options), options);

    super({ isBuild: true, ...opts });

    const require = createRequire(import.meta.url);

    this.rootDir = rootDir;
    this.cacheDir = cacheDir;

    this.pagesDir = fs
      .realpathSync(path.dirname(require.resolve('@grexie/pages/package.json')))
      .toString();
    this.modulesDirs = [];
    let dirname: string;

    dirname = this.rootDir;
    while (dirname) {
      this.modulesDirs.push(path.resolve(dirname, 'node_modules'));
      if (path.dirname(dirname) === dirname) {
        break;
      }
      dirname = path.dirname(dirname);
    }

    dirname = this.pagesDir;
    while (dirname) {
      this.modulesDirs.push(path.resolve(dirname, 'node_modules'));
      if (path.dirname(dirname) === dirname) {
        break;
      }
      dirname = path.dirname(dirname);
    }

    this.modulesDirs = [...new Set(this.modulesDirs)];

    this.outputDir = path.resolve(this.rootDir, 'build');

    this.registry = new Registry(this as BuildContext);
    this.builder = builder ?? new Builder(this, fs, defaultFiles, fsOptions);
    this.renderer = new Renderer(this);

    providers.forEach(({ provider, ...config }) => {
      this.registry.providers.add(
        new provider({
          context: this as BuildContext,
          ...this.providerConfig,
          ...config,
          exclude: this.providerConfig.exclude,
          extensions: this.providerConfig.extensions,
          configExtensions: this.providerConfig.configExtensions,
        })
      );
    });

    this.config = new ConfigContext({ context: this as BuildContext });
    this.resolverConfig = {
      extensions: Array.from(new Set([...(resolver.extensions ?? [])])),
      forceCompileExtensions: Array.from(
        new Set([...(resolver.forceCompileExtensions ?? [])])
      ),
      esmExtensions: [...new Set([...(resolver.esmExtensions ?? [])])],
      cjsExtensions: [...new Set([...(resolver.cjsExtensions ?? [])])],
      esmRoots: [...new Set([...(resolver.esmRoots ?? [])])],
      cjsRoots: [...new Set([...(resolver.cjsRoots ?? [])])],
      forceCompileRoots: Array.from(
        new Set([...(resolver.forceCompileRoots ?? [this.rootDir])])
      ),
      excludeCompileRoots: [],
    };
    this.addCompilationRoot(path.resolve(__dirname, 'defaults'));

    this.#readyResolver.resolve(
      PluginContext.create({
        rootDir: this.rootDir,
        fs: this.fs,
        descriptionFile: path.resolve(this.rootDir, 'package.json'),
      }).then(async plugins => {
        this.#plugins = plugins;
        await this.initializePlugins([...plugins.plugins]);
        await this.#events.emit(EventPhase.after, 'config', this);
        return this;
      })
    );

    (global as any).PagesBuildContext = this;

    this.sources.createChild(undefined as any, {
      providers: [
        {
          provider: Provider,
          rootDir: path.resolve(__dirname, 'defaults'),
          priority: -Infinity,
        },
      ],
      rootDir: path.resolve(__dirname, 'defaults'),
    });

    this.resolverConfig.forceCompileRoots.push(
      path.resolve(__dirname, 'defaults')
    );
  }

  get defaultFiles() {
    return this.#defaultFiles;
  }

  protected set defaultFiles(value: WritableFileSystem) {
    this.#defaultFiles = value;
  }

  get cache() {
    return this.builder.cache;
  }

  get fs() {
    return this.builder.fs;
  }

  getModuleContext(compilation: Compilation) {
    if (!ModuleContextTable.has(compilation.compiler.root)) {
      ModuleContextTable.set(
        compilation.compiler.root,
        new ModuleContext({
          context: this,
          compilation,
          ...this.resolverConfig,
        })
      );
    }
    return ModuleContextTable.get(compilation.compiler.root)!;
  }

  createSourceContext(options: SourceContextOptions) {
    return new SourceContext(options);
  }

  addSourceExtension(...extensions: string[]) {
    if (!this.providerConfig.extensions) {
      this.providerConfig.extensions = [];
    }
    this.providerConfig.extensions!.push(...extensions);
  }

  addConfigExtension(...extensions: string[]) {
    if (!this.providerConfig.configExtensions) {
      this.providerConfig.configExtensions = [];
    }
    this.providerConfig.configExtensions!.push(...extensions);
  }

  addExcludeGlob(...globs: string[]) {
    if (!this.providerConfig.exclude) {
      this.providerConfig.exclude = [];
    }
    this.providerConfig.exclude!.push(...globs);
  }

  addCompilationRoot(...paths: string[]) {
    this.resolverConfig.forceCompileRoots.push(...paths);
  }

  addCompilationExcludeRoot(...paths: string[]): void {
    this.resolverConfig.excludeCompileRoots.push(...paths);
  }

  addResolveExtension(...extensions: string[]) {
    this.resolverConfig.extensions.push(...extensions);
  }

  addEsmExtension(...extensions: string[]) {
    this.resolverConfig.esmExtensions.push(...extensions);
  }

  addEsmRoot(...paths: string[]): void {
    this.resolverConfig.esmRoots.push(...paths);
  }

  addCommonJSRoot(...paths: string[]): void {
    this.resolverConfig.cjsRoots.push(...paths);
  }

  addCommonJSExtension(...extensions: string[]) {
    this.resolverConfig.cjsExtensions.push(...extensions);
  }

  addCompileExtension(...extensions: string[]) {
    this.resolverConfig.forceCompileExtensions.push(...extensions);
  }

  dispose(): void {}

  protected async initializePlugins(plugins: Plugin[]) {
    await Promise.all(
      plugins.map(async plugin => {
        const events = EventManager.get<BuildContext>(this).create(plugin.name);
        await plugin.handler(events);
      })
    );
  }
}

class ChildBuildContext extends Context implements BuildContext {
  readonly sources = SourceResolver.getInstance(this as BuildContext);
  readonly parent: BuildContext;
  readonly compilation: Compilation;

  readonly registry: Registry;
  readonly rootDir: string;
  readonly config: ConfigContext;
  readonly mapping?: NormalizedMapping;

  get root(): BuildContext {
    return this.parent.root;
  }

  get cacheDir() {
    return this.parent.cacheDir;
  }

  get pagesDir() {
    return this.parent.pagesDir;
  }

  get outputDir() {
    return this.parent.outputDir;
  }

  get modulesDirs() {
    return this.parent.modulesDirs;
  }

  get builder() {
    return this.parent.builder;
  }

  get providerConfig() {
    return this.parent.providerConfig;
  }

  get resolverConfig() {
    return this.parent.resolverConfig;
  }

  get ready() {
    return this.parent.ready;
  }

  get plugins() {
    return this.parent.plugins;
  }

  get defaultFiles() {
    return this.parent.defaultFiles;
  }

  get cache() {
    return this.parent.cache;
  }

  get fs() {
    return this.parent.fs;
  }

  get renderer() {
    return this.parent.renderer;
  }

  createSourceContext(options: SourceContextOptions) {
    return this.parent.createSourceContext(options);
  }

  addSourceExtension(...extensions: string[]): void {
    return this.parent.addSourceExtension(...extensions);
  }

  addConfigExtension(...extensions: string[]): void {
    return this.parent.addConfigExtension(...extensions);
  }

  addExcludeGlob(...globs: string[]) {
    return this.parent.addExcludeGlob(...globs);
  }

  addCompilationRoot(...paths: string[]) {
    return this.parent.addCompilationRoot(...paths);
  }

  addCompilationExcludeRoot(...paths: string[]): void {
    return this.parent.addCompilationExcludeRoot(...paths);
  }

  addResolveExtension(...extensions: string[]) {
    return this.parent.addResolveExtension(...extensions);
  }

  addEsmExtension(...extensions: string[]) {
    return this.parent.addEsmExtension(...extensions);
  }

  addCommonJSExtension(...extensions: string[]) {
    return this.parent.addCommonJSExtension(...extensions);
  }

  addCompileExtension(...extensions: string[]) {
    return this.parent.addCompileExtension(...extensions);
  }

  getModuleContext(compilation: Compilation) {
    if (!ModuleContextTable.has(compilation.compiler.root)) {
      ModuleContextTable.set(
        compilation.compiler.root,
        new ModuleContext({
          context: this,
          compilation,
          ...this.resolverConfig,
        })
      );
    }
    return ModuleContextTable.get(compilation.compiler.root)!;
  }

  constructor(options: ChildBuildContextOptions) {
    const { parent, providers, rootDir, mapping, compilation } = options;
    super({ isServer: parent.isServer, isBuild: parent.isBuild });
    this.parent = parent;
    this.parent.sources.children.add(this.sources);
    if (mapping) {
      this.mapping = mapping;
    }
    this.compilation = compilation;
    // (compilation as any)?.pagesContext = this;
    this.rootDir = rootDir;
    this.registry = new Registry(this);
    for (const { provider, ...config } of providers ?? []) {
      const p = new provider({
        context: this,
        ...(parent.providerConfig ?? {}),
        ...config,
        exclude: parent.providerConfig.exclude,
        extensions: parent.providerConfig.extensions,
        configExtensions: parent.providerConfig.configExtensions,
      });
      this.registry.providers.add(p);
    }
    this.config = new ConfigContext({ context: this });
  }

  dispose(): void {
    this.parent.sources.children.delete(this.sources);
  }
}
