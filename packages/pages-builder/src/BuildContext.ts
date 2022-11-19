import { ContextOptions, Context } from '@grexie/pages/api';
import path from 'path';
import type { FileSystemOptions, WritableFileSystem } from './FileSystem.js';
import { Builder } from './Builder.js';
import { ProviderConfig, Registry } from './Registry.js';
import { ModuleContext } from './ModuleContext.js';
import os from 'os';
import { ConfigContext } from './ConfigContext.js';
import { Volume } from 'memfs';
import { createRequire } from 'module';
import type { Compiler, Compilation } from 'webpack';
import type { ModuleResolverConfig } from './ModuleResolver.js';
import type { SourceContextOptions } from './SourceContext.js';
import { SourceContext } from './SourceContext.js';
import resolve from 'enhanced-resolve';
import { createResolver } from '@grexie/resolvable';
import { Events, EventManager } from './EventManager.js';
import { PluginContext } from './PluginContext.js';

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

export class BuildContext extends Context {
  readonly registry: Registry;
  readonly rootDir: string;
  readonly cacheDir: string;
  readonly pagesDir: string;
  readonly outputDir: string;
  readonly modulesDirs: string[];
  readonly builder: Builder;
  readonly config: ConfigContext;
  #defaultFiles: WritableFileSystem = new Volume() as WritableFileSystem;
  readonly #moduleContextTable = new WeakMap<Compiler, ModuleContext>();
  readonly resolverConfig: Required<ModuleResolverConfig>;
  readonly plugins = new Map<string, Promise<Plugin>>();
  readonly #readyResolver = createResolver<BuildContext>();
  readonly ready = this.#readyResolver.finally(() => {});
  readonly #events = EventManager.get<BuildContext>(this);
  readonly #plugins: PluginContext;

  get plugins() {
    return this.#plugins.plugins;
  }

  constructor(options: BuildContextOptions & { isServer?: boolean }) {
    const {
      rootDir,
      cacheDir,
      providers,
      fs,
      defaultFiles,
      fsOptions,
      resolver,
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
    this.builder = new Builder(this, fs, defaultFiles, fsOptions);

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
          '.md',
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
          '.md',
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
          '.jpeg',
          '.jpg',
          '.png',
          '.webp',
          '.gif',
          '.svg',
          '.pages.yml',
          '.pages.yaml',
          '.md',
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
      await this.initializePlugins(plugins.plugins);
      this.#readyResolver.resolve(this);
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
    if (!this.#moduleContextTable.has(compilation.compiler.root)) {
      this.#moduleContextTable.set(
        compilation.compiler.root,
        new ModuleContext({
          context: this,
          compilation,
          ...this.resolverConfig,
        })
      );
    }
    return this.#moduleContextTable.get(compilation.compiler.root)!;
  }

  createSourceContext(options: SourceContextOptions) {
    return new SourceContext(options);
  }

  addCompilationRoot(...paths) {
    this.resolverConfig.forceCompileRoots.push(...paths);
  }

  addEsmExtension(...extensions) {
    this.resolverConfig.esmExtensions.push(...extensions);
  }

  addCompileExtension(...extensions) {
    this.resolverConfig.forceCompileExtensions.push(...extensions);
  }

  protected async initializePlugins(plugins: Plugin[]) {
    await Promise.all(
      plugins.map(async plugin => {
        const events = EventManager.get<BuildContext>(this).create(plugin.name);
        console.info(plugin.name);
        await plugin.handler(events);
      })
    );
  }
}
