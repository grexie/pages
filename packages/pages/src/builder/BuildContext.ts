import { ContextOptions, Context } from '../api/Context.js';
import path from 'path';
import {
  FileSystemOptions,
  WritableFileSystem,
} from '@grexie/builder/FileSystem.js';
import { Builder } from './Builder.js';
import { ProviderConfig, Registry } from './Registry.js';
import { Renderer } from './Renderer.js';
import { ModuleContext } from './ModuleContext.js';
import os from 'os';
import { ConfigContext } from './ConfigContext.js';
import { Volume } from 'memfs';
import { ModuleDependencies } from './ModuleDependencies.js';
import { createRequire } from 'module';
import { Compilation } from 'webpack';

const __dirname = path.dirname(new URL(import.meta.url).pathname);

export interface BuildOptions extends ContextOptions {
  providers?: ProviderConfig[];
  rootDir?: string;
  fs: WritableFileSystem;
  defaultFiles?: WritableFileSystem;
  fsOptions?: FileSystemOptions[];
  // resolver?: ModuleResolverOptions;
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
  // readonly modules: ModuleContext;
  readonly config: ConfigContext;
  readonly dependencies: ModuleDependencies;
  #defaultFiles: WritableFileSystem = new Volume() as WritableFileSystem;
  readonly #moduleContextTable = new WeakMap<Compilation, ModuleContext>();

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
    console.info(this.modulesDirs);
    this.outputDir = path.resolve(this.rootDir, 'build');

    this.registry = new Registry(this);
    this.builder = new Builder(this, fs, defaultFiles, fsOptions);
    this.dependencies = new ModuleDependencies({
      cache: this.cache.create('modules'),
      fs: this.fs,
    });
    this.renderer = new Renderer(this);
    // this.modules = new ModuleContext({
    //   context: this,
    //   resolver: {
    //     extensions: Array.from(
    //       new Set([
    //         ...(resolver.extensions ?? []),
    //         '.yml',
    //         '.yaml',
    //         '.md',
    //         '.js',
    //         '.cjs',
    //         '.mjs',
    //         '.jsx',
    //         '.ts',
    //         '.tsx',
    //       ])
    //     ),
    //     forceExtensions: Array.from(
    //       new Set([
    //         ...(resolver.forceExtensions ?? []),
    //         '.md',
    //         '.pages.yml',
    //         '.pages.yaml',
    //         '.pages.json',
    //         '.pages.js',
    //         '.pages.ts',
    //         '.jsx',
    //         '.ts',
    //         '.tsx',
    //         '.scss',
    //         '.css',
    //         '.jpeg',
    //         '.jpg',
    //         '.png',
    //         '.webp',
    //         '.gif',
    //         '.svg',
    //       ])
    //     ),
    //     esm: [
    //       ...new Set([
    //         ...(resolver.esm ?? []),
    //         '.scss',
    //         '.css',
    //         '.jpeg',
    //         '.jpg',
    //         '.png',
    //         '.webp',
    //         '.gif',
    //         '.svg',
    //         '.pages.yml',
    //         '.pages.yaml',
    //         '.md',
    //         '.jsx',
    //         '.ts',
    //         '.tsx',
    //         '.mjs',
    //       ]),
    //     ],
    //     forceCompile: Array.from(new Set([...(resolver.forceCompile ?? [])])),
    //   },
    // });

    providers.forEach(({ provider, ...config }) => {
      this.registry.providers.add(
        new provider({
          context: this,
          ...config,
        })
      );
    });

    this.config = new ConfigContext({ context: this });
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
    // if (!this.#moduleContextTable.has(compilation)) {
    //   this.#moduleContextTable.set(
    //     compilation,
    //     new ModuleContext({
    //       context: this,
    //       compilation,
    //     })
    //   );
    // }
    // return this.#moduleContextTable.get(compilation)!;
    return new ModuleContext({ context: this, compilation });
  }
}
