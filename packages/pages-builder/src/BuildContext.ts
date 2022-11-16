import { ContextOptions, Context } from '@grexie/pages/api';
import path from 'path';
import { FileSystemOptions, WritableFileSystem } from './FileSystem.js';
import { Builder } from './Builder.js';
import { ProviderConfig, Registry } from './Registry.js';
import { Renderer } from './Renderer.js';
import { ModuleContext } from './ModuleContext.js';
import os from 'os';
import { ConfigContext } from './ConfigContext.js';
import { Volume } from 'memfs';
import { createRequire } from 'module';
import { Compiler, Compilation } from 'webpack';
import { ModuleResolverConfig } from './ModuleResolver.js';
import { SourceContext, SourceContextOptions } from './SourceContext.js';

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
  readonly renderer: Renderer;
  readonly config: ConfigContext;
  #defaultFiles: WritableFileSystem = new Volume() as WritableFileSystem;
  readonly #moduleContextTable = new WeakMap<Compiler, ModuleContext>();
  readonly resolverConfig: Required<ModuleResolverConfig>;

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
    this.renderer = new Renderer(this);

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
          '.jpeg',
          '.jpg',
          '.png',
          '.webp',
          '.gif',
          '.svg',
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
        new Set([...(resolver.forceCompileRoots ?? [this.pagesDir])])
      ),
    };
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
}
