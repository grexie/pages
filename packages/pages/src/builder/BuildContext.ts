import { ContextOptions, Context } from '../api/Context';
import path from 'path';
import { FileSystemOptions, WritableFileSystem } from '@grexie/builder';
import { Builder } from './Builder';
import { ProviderConfig, Registry } from '../api';
import { Renderer } from './Renderer';
import { ModuleContext } from './ModuleContext';
import os from 'os';
import { ConfigContext } from './ConfigContext';

export interface BuildOptions extends ContextOptions {
  providers?: ProviderConfig[];
  rootDir?: string;
  fs: WritableFileSystem;
  fsOptions?: FileSystemOptions[];
}

const defaultOptions = () => ({
  providers: [] as ProviderConfig[],
  rootDir: path.resolve(process.cwd(), process.env.PAGES_ROOT ?? '.'),
  cacheDir: path.resolve(
    process.cwd(),
    process.env.PAGES_CACHE ??
      path.resolve(os.tmpdir(), '@grexie', 'pages', 'cache')
  ),
  fsOptions: [],
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

  constructor(options: BuildContextOptions & { isServer?: boolean }) {
    const { rootDir, cacheDir, providers, fs, fsOptions, ...opts } =
      Object.assign(defaultOptions(), options);
    super({ isBuild: true, ...opts });

    this.registry = new Registry(this);

    this.rootDir = rootDir;
    this.cacheDir = cacheDir;
    this.pagesDir = path.resolve(__dirname, '..');
    this.modulesDirs = [
      path.resolve(this.rootDir, 'node_modules'),
      path.resolve(this.pagesDir, '..', '..', 'node_modules'),
    ];
    this.outputDir = path.resolve(this.rootDir, 'build');

    this.builder = new Builder(this, fs, fsOptions);
    this.renderer = new Renderer(this);
    this.modules = new ModuleContext({
      context: this,
      resolver: {
        extensions: ['.md', '.jsx', '.ts', '.tsx'],
        forceCompile: ['@mdx-js/mdx'],
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

  get cache() {
    return this.builder.cache;
  }

  get fs() {
    return this.builder.fs;
  }
}
