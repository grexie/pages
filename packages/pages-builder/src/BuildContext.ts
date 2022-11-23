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
import { PluginContext, Plugin } from './PluginContext.js';
import { ICache } from './Cache.js';
import webpack from 'webpack';
import { string } from 'prop-types';

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
  readonly sources: SourceResolver;
  readonly mapping?: NormalizedMapping;

  dispose(): void;

  getModuleContext(compilation: Compilation): ModuleContext;
  createSourceContext(options: SourceContextOptions): SourceContext;
  addExcludeGlob(...globs: string[]): void;
  addCompilationRoot(...paths: string[]): void;
  addResolveExtension(...extensions: string[]): void;
  addEsmExtension(...extensions: string[]): void;
  addCompileExtension(...extensions: string[]): void;
}

const BuildContextTable = new WeakMap<Compilation, BuildContext>();

const SourceResolverTable = new WeakMap<BuildContext, SourceResolver>();

class SourceResolver {
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

  addMapping(mapping: NormalizedMapping, sources: SourceResolver) {
    // this.mappings[mapping.to] = sources;
  }

  removeMapping(mapping: NormalizedMapping) {
    // delete this.mappings[mapping.to];
  }

  isRootDir(value: string): boolean {
    let { rootDir } = this.context;
    if (rootDir[rootDir.length - 1] !== '/') {
      rootDir += '/';
    }
    if (value.startsWith(rootDir)) {
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

  async getSource({ path }: { path: string[] }): Promise<Source> {
    let stack: SourceResolver[] = [
      ...this.ancestors,
      this,
      ...this.descendants,
    ];
    let el: SourceResolver | undefined;

    let out = [];

    while ((el = stack.shift())) {
      out.push(...(await el.context.registry.list()));
      const result = await el.context.registry.get({ path });
      if (result) {
        return result;
      }
    }

    throw new Error(`unable to resolve ${JSON.stringify(path.join('/'))}`);
  }

  lookupMapping(context: string[]): SourceResolver | undefined {
    const from = this.context.mapping?.from.split(/\//g).filter(x => !!x);
    if (from) {
      for (let i = 0; i < from.length ?? 0; i++) {
        if (from[i] !== context[i]) {
          break;
        } else {
          if (i === from.length - 1) {
            return this;
          }
        }
      }
    }

    for (const sources of this.children) {
      const result = sources.lookupMapping(context);
      if (result) {
        return result;
      }
    }
  }

  async resolve({ context, request }: { context: string[]; request: string }) {
    let path: string[];

    if (/Header/.test(request)) {
      let i = 1;
    }

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

    let mapping = this.lookupMapping(context)?.context?.mapping?.to ?? [];

    path.unshift(...mapping);

    return this.getSource({ path });
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
  readonly config: ConfigContext;
  readonly providerConfig: Partial<ProviderConfig> = {
    exclude: [],
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

    this.registry = new Registry(this as BuildContext);
    this.builder = builder ?? new Builder(this, fs, defaultFiles, fsOptions);

    providers.forEach(({ provider, ...config }) => {
      this.registry.providers.add(
        new provider({
          context: this as BuildContext,
          ...this.providerConfig,
          ...config,
          exclude: [
            ...(this.providerConfig.exclude ?? []),
            ...(config.exclude ?? []),
          ],
        })
      );
    });

    this.config = new ConfigContext({ context: this as BuildContext });
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
          '.css',
        ])
      ),
      esmExtensions: [
        ...new Set([
          ...(resolver.esmExtensions ?? []),
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
        new Set([...(resolver.forceCompileRoots ?? [this.rootDir])])
      ),
    };

    PluginContext.create(
      this.fs,
      path.resolve(this.rootDir, 'package.json')
    ).then(async plugins => {
      this.#plugins = plugins;
      await this.initializePlugins([...plugins.plugins]);
      await this.#events.emit(EventPhase.after, 'config', this);
      this.#readyResolver.resolve(this as BuildContext);
    });

    (global as any).PagesBuildContext = this;
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

  addExcludeGlob(...globs: string[]) {
    if (!this.providerConfig.exclude) {
      this.providerConfig.exclude = [];
    }
    this.providerConfig.exclude!.push(...globs);
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
    return [
      path.resolve(this.rootDir, 'node_modules'),
      ...this.parent.modulesDirs.slice(1),
    ];
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

  createSourceContext(options: SourceContextOptions) {
    return this.parent.createSourceContext(options);
  }

  addExcludeGlob(...globs: string[]) {
    return this.parent.addExcludeGlob(...globs);
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
      this.parent.sources.addMapping(mapping, this.sources);
    }
    this.compilation = compilation;
    (compilation as any).pagesContext = this;
    this.rootDir = rootDir;
    this.registry = new Registry(this);
    for (const { provider, ...config } of providers ?? []) {
      const p = new provider({
        context: this,
        ...(parent.providerConfig ?? {}),
        ...config,
        exclude: [
          ...(parent.providerConfig.exclude ?? []),
          ...(config.exclude ?? []),
        ],
      });
      this.registry.providers.add(p);
    }
    this.config = new ConfigContext({ context: this });
  }

  dispose(): void {
    this.parent.sources.children.delete(this.sources);
    if (this.mapping) {
      this.parent.sources.removeMapping(this.mapping);
    }
  }
}
