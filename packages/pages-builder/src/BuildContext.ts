import { ContextOptions, Context, NormalizedMapping } from '@grexie/pages/api';
import path from 'path';
import type { FileSystemOptions, WritableFileSystem } from './FileSystem.js';
import { Builder } from './Builder.js';
import { ProviderConfig, Registry } from './Registry.js';
import { ModuleContext } from './ModuleContext.js';
import os from 'os';
import { ConfigContext } from './ConfigContext.js';
import { Volume } from 'memfs';
import { createRequire } from 'module';
import { Compiler, Compilation, EntryOptions } from 'webpack';
import type { ModuleResolverConfig } from './ModuleResolver.js';
import type { SourceContextOptions } from './SourceContext.js';
import { SourceContext } from './SourceContext.js';
import resolve from 'enhanced-resolve';
import { createResolver } from '@grexie/resolvable';
import { Events, EventManager, EventPhase } from './EventManager.js';
import { PluginContext, Plugin } from './PluginContext.js';
import { ICache } from './Cache.js';
import webpack from 'webpack';

export interface ChildBuildOptions {
  providers: ProviderConfig[];
  rootDir: string;
  mapping: NormalizedMapping;
}

export interface ChildBuildContextOptions extends ChildBuildOptions {
  parent: BuildContext;
  compilation: Compilation;
}

export interface BuildOptions extends ContextOptions {
  providers?: ProviderConfig[];
  rootDir?: string;
  fs: WritableFileSystem;
  defaultFiles?: WritableFileSystem;
  fsOptions?: FileSystemOptions[];
  resolver?: ModuleResolverConfig;
}

const defaultOptions = () => ({
  providers: [] as ProviderConfig[],
  rootDir: path.resolve(process.cwd(), process.env.PAGES_ROOT ?? '.'),
  cacheDir: path.resolve(
    process.cwd(),
    process.env.PAGES_CACHE ??
      path.resolve(os.tmpdir(), '@grexie', 'pages', 'cache')
  ),
  defaultFiles: new Volume(),
  fsOptions: [],
  resolver: {},
});

export interface BuildContextOptions extends BuildOptions {}

export interface BuildContext extends Context {
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
  readonly cache: ICache;
  readonly fs: WritableFileSystem;
  readonly children: Set<BuildContext>;
  readonly compilation?: Compilation;
  readonly entries: EntryOptions[];
  readonly entrypoints: Map<string, webpack.Entrypoint>;

  dispose(): void;
  isRootDir(value: string): boolean;

  getModuleContext(compilation: Compilation): ModuleContext;
  createSourceContext(options: SourceContextOptions): SourceContext;
  addCompilationRoot(...paths: string[]): void;
  addResolveExtension(...extensions: string[]): void;
  addEsmExtension(...extensions: string[]): void;
  addCompileExtension(...extensions: string[]): void;

  createChild(
    compilation: Compilation,
    options: ChildBuildOptions
  ): BuildContext;
}

const BuildContextTable = new WeakMap<Compilation, BuildContext>();

const resolveSource = (
  mapping: string[],
  entries: { slug: string; filename: string }[],
  context: string,
  request: string
) => {
  let slug;
  if (request.startsWith('/')) {
    const requestPath = request.substring(1).split(/\//g);
    requestPath.unshift(...mapping);

    console.info(mapping, requestPath);
    slug = requestPath.join('/');
  } else {
    const contextPath = context.split(/\//g).filter(x => !!x);
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
        contextPath.push(requestPath.shift());
      }
    }

    contextPath.unshift(...mapping);
    slug = contextPath.join('/');
  }

  console.info('!!!!!!!!', slug, context, request);
  console.info(entries);
  const source = entries.find(entry => entry.slug === slug);
  if (!source) {
    throw new Error(`unable to resolve ${request} in ${context}`);
  }
  console.info(source);
  return source;
};

const ModuleContextTable = new WeakMap<Compiler, ModuleContext>();

export class RootBuildContext extends Context implements BuildContext {
  readonly registry: Registry;
  readonly rootDir: string;
  readonly cacheDir: string;
  readonly pagesDir: string;
  readonly outputDir: string;
  readonly modulesDirs: string[];
  readonly builder: Builder;
  readonly config: ConfigContext;
  #defaultFiles: WritableFileSystem = new Volume() as WritableFileSystem;
  readonly resolverConfig: Required<ModuleResolverConfig>;
  readonly #readyResolver = createResolver<BuildContext>();
  readonly ready = this.#readyResolver.finally(() => {});
  readonly #events = EventManager.get<BuildContext>(this);
  #plugins?: PluginContext;
  readonly children = new Set<BuildContext>();

  get plugins() {
    return this.#plugins?.plugins;
  }

  get root(): string {
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
    } = Object.assign(defaultOptions(), options);
    super({ isBuild: true, ...opts });

    const require = createRequire(import.meta.url);

    this.rootDir = rootDir;
    this.cacheDir = cacheDir;

    this.pagesDir = path.dirname(require.resolve('@grexie/pages/package.json'));
    const pagesModules: string[] = [];
    let dirname = this.pagesDir;
    while (dirname) {
      pagesModules.push(path.resolve(dirname, 'node_modules'));
      if (path.dirname(dirname) === dirname) {
        break;
      }
      dirname = path.dirname(dirname);
    }
    this.modulesDirs = [
      path.resolve(this.rootDir, 'node_modules'),
      ...pagesModules,
    ];

    this.outputDir = path.resolve(this.rootDir, 'build');

    this.registry = new Registry(this);
    this.builder = builder ?? new Builder(this, fs, defaultFiles, fsOptions);

    providers.forEach(({ provider, ...config }) => {
      this.registry.providers.add(
        new provider({
          context: this,
          ...config,
        })
      );
    });

    this.config = new ConfigContext({ context: this });
    this.resolverConfig = {
      extensions: Array.from(
        new Set([
          ...(resolver.extensions ?? []),
          '.yml',
          '.yaml',
          '.js',
          '.cjs',
          '.mjs',
          '.jsx',
          '.ts',
          '.tsx',
        ])
      ),
      forceCompileExtensions: Array.from(
        new Set([
          ...(resolver.forceCompileExtensions ?? []),
          '.pages.yml',
          '.pages.yaml',
          '.pages.json',
          '.pages.js',
          '.pages.ts',
          '.jsx',
          '.ts',
          '.tsx',
          '.scss',
          '.css',
        ])
      ),
      esmExtensions: [
        ...new Set([
          ...(resolver.esmExtensions ?? []),
          '.scss',
          '.css',
          '.pages.yml',
          '.pages.yaml',
          '.jsx',
          '.ts',
          '.tsx',
          '.mjs',
        ]),
      ],
      forceCompileRoots: Array.from(
        new Set([...(resolver.forceCompileRoots ?? [])])
      ),
    };

    PluginContext.create(
      this.fs,
      path.resolve(this.rootDir, 'package.json')
    ).then(async plugins => {
      this.#plugins = plugins;
      await this.initializePlugins([...plugins.plugins]);
      await this.#events.emit(EventPhase.after, 'config', this);
      this.#readyResolver.resolve(this);
    });
  }

  get entries(): { name: string; filename: string } {
    const entries = [];

    for (const entry of this.compilation.entries.values() ?? []) {
      entries.push({
        slug: entry.options.name,
        filename: path.resolve(
          this.compilation.compiler.context,
          entry.dependencies[0].request
        ),
        registry: this.registry,
      });
    }

    for (const child of this.children) {
      entries.push(...child.entries);
    }

    return entries;
  }

  resolveSource(context: string, request: string) {
    return resolveSource([], this.entries, context, request);
  }

  isRootDir(value: string): boolean {
    let { rootDir } = this;
    if (rootDir[rootDir.length - 1] !== '/') {
      rootDir += '/';
    }
    if (value.startsWith(rootDir)) {
      return true;
    }

    for (const context of this.children) {
      if (context.isRootDir(value)) {
        return true;
      }
    }
    return false;
  }

  createChild(
    compilation: Compilation,
    options: ChildBuildOptions
  ): BuildContext {
    return new ChildBuildContext({
      parent: this,
      compilation,
      ...options,
    });
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

  addCompilationRoot(...paths: string[]) {
    this.resolverConfig.forceCompileRoots.push(...paths);
  }

  addResolveExtension(...extensions: string[]) {
    this.resolverConfig.extensions.push(...extensions);
  }

  addEsmExtension(...extensions: string[]) {
    this.resolverConfig.esmExtensions.push(...extensions);
  }

  addCompileExtension(...extensions: string[]) {
    this.resolverConfig.forceCompileExtensions.push(...extensions);
  }

  dispose(): void {
    this.buildGroup.delete(this);
  }

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
  readonly parent: BuildContext;
  readonly compilation: Compilation;

  readonly registry: Registry;
  readonly rootDir: string;
  readonly config: ConfigContext;
  readonly mapping: NormalizedMapping;

  readonly children = new Set<BuildContext>();

  get entries(): { name: string; filename: string } {
    const entries = [];

    for (const entry of this.compilation.entries.values() ?? []) {
      entries.push({
        slug: entry.options.name,
        filename: path.resolve(
          this.compilation.compiler.context,
          entry.dependencies[0].request
        ),
        registry: this.registry,
      });
    }

    for (const child of this.children) {
      entries.push(...child.entries);
    }

    return entries;
  }

  get root(): string {
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
    return [
      path.resolve(this.rootDir, 'node_modules'),
      ...this.parent.modulesDirs.slice(1),
    ];
  }

  get builder() {
    return this.parent.builder;
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

  getModuleContext(compilation: Compilation) {
    return this.parent.getModuleContext(compilation);
  }

  createSourceContext(options: SourceContextOptions) {
    return this.parent.createSourceContext(options);
  }

  addCompilationRoot(...paths: string[]) {
    return this.parent.addCompilationRoot(...paths);
  }

  addResolveExtension(...extensions: string[]) {
    return this.parent.addResolveExtension(...extensions);
  }

  addEsmExtension(...extensions: string[]) {
    return this.parent.addEsmExtension(...extensions);
  }
  addCompileExtension(...extensions: string[]) {
    return this.parent.addCompileExtension(...extensions);
  }

  createChild(
    compilation: Compilation,
    options: ChildBuildOptions
  ): BuildContext {
    return new ChildBuildContext({
      parent: this,
      compilation,
      ...options,
    });
  }

  isRootDir(value: string): boolean {
    let { rootDir } = this;
    if (rootDir[rootDir.length - 1] !== '/') {
      rootDir += '/';
    }
    if (value.startsWith(rootDir)) {
      return true;
    }

    for (const context of this.children) {
      if (context.isRootDir(value)) {
        return true;
      }
    }
    return false;
  }

  resolveSource(context: string, request: string) {
    return resolveSource(this.mapping.to, this.entries, context, request);
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
    console.info(mapping);
    this.mapping = mapping;
    parent.children.add(this);
    this.compilation = compilation;
    compilation.pagesContext = this;
    this.rootDir = rootDir;
    this.registry = new Registry(this);
    for (const provider of this.parent.registry.providers) {
      // this.registry.providers.add(provider);
    }
    for (const { provider, ...config } of providers ?? []) {
      const p = new provider({ context: this, ...config });
      this.registry.providers.add(p);
      // this.parent.registry.providers.add(p);
    }
    this.config = new ConfigContext({ context: this });
  }

  dispose(): void {
    this.parent.children.delete(this);
  }
}
