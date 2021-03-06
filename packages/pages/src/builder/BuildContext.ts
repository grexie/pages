import { ContextOptions, Context } from '../api/Context';
import path from 'path';
import { FileSystemOptions, WritableFileSystem } from '@grexie/builder';
import { Builder } from './Builder';
import { ProviderConfig, Registry } from '../api';
import { Renderer } from './Renderer';
import { ModuleContext, ModuleResolverOptions } from './ModuleContext';
import os from 'os';
import { ConfigContext } from './ConfigContext';
import { Volume } from 'memfs';

export interface BuildOptions extends ContextOptions {
  providers?: ProviderConfig[];
  rootDir?: string;
  fs: WritableFileSystem;
  defaultFiles?: WritableFileSystem;
  fsOptions?: FileSystemOptions[];
  resolver?: ModuleResolverOptions;
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
  readonly modules: ModuleContext;
  readonly config: ConfigContext;
  #defaultFiles: WritableFileSystem = new Volume() as WritableFileSystem;

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
    this.modules = new ModuleContext({
      context: this,
      resolver: {
        extensions: Array.from(
          new Set([
            ...(resolver.extensions ?? []),
            '.yml',
            '.yaml',
            '.md',
            '.jsx',
            '.ts',
            '.tsx',
          ])
        ),
        forceExtensions: Array.from(
          new Set([...(resolver.forceExtensions ?? [])])
        ),
        forceCompile: Array.from(
          new Set([...(resolver.forceCompile ?? []), '@mdx-js/mdx'])
        ),
      },
    });
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
}
