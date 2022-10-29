import {
  Builder as BuilderBase,
  Watcher,
  Configuration,
  EntryObject,
  FileSystemOptions,
  WebpackStats,
  FileSystem,
  WritableFileSystem,
  CacheStorage,
} from '@grexie/builder';
import { BuildContext } from './BuildContext';
import { Cache } from '@grexie/builder';
import { Source } from '../api';
import nodeExternals from 'webpack-node-externals';
import _path from 'path';
import { Volume } from 'memfs';
import { ResourcesPlugin } from './plugins/resources-plugin';
import { ModuleContext } from './ModuleContext.new';
import { Compilation } from 'webpack';
import path from 'path';
import webpack from 'webpack';
import { createRequire } from 'module';

const __dirname = path.dirname(new URL(import.meta.url).pathname);

export class Builder {
  readonly context: BuildContext;
  readonly defaultFiles: WritableFileSystem;
  readonly #builder: BuilderBase;
  readonly cache: Cache;

  get fs() {
    return this.#builder.fs;
  }

  constructor(
    context: BuildContext,
    fs: WritableFileSystem,
    defaultFiles: WritableFileSystem,
    fsOptions: FileSystemOptions[]
  ) {
    this.context = context;
    this.#builder = new BuilderBase();
    this.defaultFiles = defaultFiles;
    const { cache } = this.#createFileSystem(fs, fsOptions);
    this.cache = cache;
  }

  #createFileSystem(fs: WritableFileSystem, fsOptions: FileSystemOptions[]) {
    if ((process.env.NODE_ENV ?? 'development') === 'development') {
      this.#builder.fs.add(
        _path.resolve(this.context.pagesDir, '..', '..'),
        fs
      );
    }

    this.defaultFiles.mkdirSync(this.context.rootDir, { recursive: true });
    this.defaultFiles.writeFileSync(
      _path.resolve(this.context.rootDir, 'package.json'),
      '{}'
    );

    this.#builder.fs.add(
      this.context.rootDir,
      new FileSystem().add('/', this.defaultFiles).add(this.context.rootDir, fs)
    );

    fsOptions.forEach(options =>
      this.#builder.fs.add(options.path, options.fs, options.writable)
    );

    const cacheStorage: CacheStorage = {
      ephemeral: new FileSystem()
        .add('/', new Volume(), true)
        .add(this.context.cacheDir, fs, true),
      persistent: new FileSystem()
        .add('/', new Volume(), true)
        .add(this.context.cacheDir, fs, true),
    };

    const cache = new Cache({
      storage: cacheStorage,
      cacheDir: this.context.cacheDir,
    });

    return { cache };
  }

  filenameToPath(
    filename: string,
    rootDir: string = this.context.rootDir
  ): string[] {
    const path = _path
      .relative(rootDir, filename)
      .split(/\//g)
      .map(p => p.substring(0, p.length - _path.extname(p).length));

    if (path[path.length - 1] === 'index') {
      path.pop();
    }

    return path;
  }

  async output({
    filename,
    path,
    wait = false,
  }: {
    filename?: string;
    path?: string[];
    wait?: boolean;
  }): Promise<Buffer> {
    if (path) {
      path = path.slice();
      const slug = [...path, 'index.js'].join('/');
      filename = `${slug}.js`;
    }

    if (!filename) {
      throw new Error('filename or path must be provided');
    }

    filename = _path.resolve(this.context.outputDir, filename);

    try {
      const buffer = await this.fs.readFile(filename);
      return Buffer.from(buffer);
    } catch (err) {
      if (!wait) {
        throw err;
      }

      await new Promise(resolve => {
        this.#builder.fs.once(`write:${filename}`, () => resolve);
      });
      const buffer = await this.fs.readFile(filename);
      return Buffer.from(buffer);
    }
  }

  entry(source: Source): EntryObject {
    let path = source.path.slice();
    const slug = [...path, 'index'].join('/');
    return {
      [slug]: `./${_path.relative(this.context.rootDir, source.filename)}`,
    };
  }

  #loader(loader: string, options: any = {}): webpack.RuleSetUseItem {
    return {
      loader: loader,
      options: {
        context: this.context,
        ...options,
      },
    } as any;
  }

  async config(sources: Source[]): Promise<Configuration> {
    const require = createRequire(import.meta.url);

    return {
      context: this.context.rootDir,
      entry: {
        ...sources
          .map(source => this.entry(source))
          .reduce((a, b) => ({ ...a, ...b }), {}),
      },
      mode: 'development',
      output: {
        path: this.context.outputDir,
        filename: `[name].js`,
      },
      // externals: [
      //   nodeExternals({
      //     modulesDir: this.context.modulesDirs[0],
      //     additionalModuleDirs: this.context.modulesDirs.slice(1),
      //   }),
      // ],
      module: {
        rules: [
          {
            type: 'javascript/esm',
            test: /\.scss$/,
            use: [
              this.#loader('cache-loader'),
              this.#loader('style-loader'),
              'css-loader',
              'sass-loader',
            ],
            include: /\.global\.scss$/,
          },
          {
            type: 'javascript/esm',
            test: /\.scss$/,
            use: [
              this.#loader('cache-loader'),
              this.#loader('style-loader'),
              {
                loader: 'css-loader',
                options: {
                  modules: true,
                },
              },
              'sass-loader',
            ],
            include: /\.module\.scss$/,
          },
          {
            type: 'javascript/esm',
            test: /\.css$/,
            use: [
              this.#loader('cache-loader'),
              this.#loader('style-loader'),
              'css-loader',
            ],
            include: /\.global\.css$/,
          },
          {
            type: 'javascript/esm',
            test: /\.css$/,
            use: [
              this.#loader('cache-loader'),
              this.#loader('style-loader'),
              {
                loader: 'css-loader',
                options: {
                  modules: true,
                },
              },
            ],
            include: /\.module\.css$/,
          },
          {
            type: 'javascript/esm',
            test: /\.(png|jpe?g|gif|webp|svg)$/,
            use: [
              this.#loader('cache-loader'),
              this.#loader('image-loader'),
              'raw-loader',
            ],
          },
          {
            type: 'javascript/esm',
            test: /\.pages\.([mc]?js|ts)$/,
            use: [
              this.#loader('cache-loader'),
              this.#loader('pages-loader'),
              {
                loader: 'babel-loader',
                options: {
                  presets: [
                    '@babel/typescript',
                    ['@babel/env', { loose: true, modules: false }],
                  ],
                  cwd: this.context.pagesDir,
                  root: this.context.rootDir,
                },
              },
            ],
          },
          {
            type: 'javascript/esm',
            test: /(^\.?|\/\.?|\.)pages.ya?ml$/,
            exclude: /(node_modules|bower_components)/,
            use: [
              this.#loader('cache-loader'),
              this.#loader('pages-loader'),
              this.#loader('yaml-loader'),
            ],
          },
          {
            type: 'javascript/esm',
            test: /\.(md|mdx)$/,
            exclude: /(node_modules|bower_components)/,
            use: [
              this.#loader('cache-loader'),
              this.#loader('module-loader', {
                handler: '@grexie/pages/handlers/markdown',
              }),
            ],
          },
          {
            type: 'javascript/esm',
            test: /\.(jsx?|mjs|cjs)$/,
            include: [this.context.rootDir],
            //include: [/node_modules\/@mdx-js/],
            exclude: /(node_modules|bower_components)/,
            use: [
              this.#loader('cache-loader'),
              this.#loader('module-loader'),
              {
                loader: 'babel-loader',
                options: {
                  presets: [
                    '@babel/react',
                    [
                      '@babel/env',
                      {
                        targets: 'node 16',
                        modules: false,
                      },
                    ],
                  ],
                  cwd: this.context.pagesDir,
                  root: this.context.rootDir,
                },
              },
            ],
          },
          {
            type: 'javascript/esm',
            test: /\.(ts|tsx)$/,
            include: [this.context.rootDir],
            exclude: /(node_modules|bower_components)/,
            use: [
              this.#loader('cache-loader'),
              this.#loader('module-loader'),
              {
                loader: 'babel-loader',
                options: {
                  presets: [
                    '@babel/typescript',
                    '@babel/react',
                    [
                      '@babel/env',
                      {
                        targets: 'node 16',
                        modules: false,
                      },
                    ],
                  ],
                  cwd: this.context.pagesDir,
                  root: this.context.rootDir,
                },
              },
            ],
          },
          // {
          //   // INCLUDED for TESTS
          //   // TODO: move out to plugins / config on context
          //   test: /\.(ts|tsx)$/,
          //   exclude: /(node_modules|bower_components)/,
          //   use: [
          //     {
          //       loader: 'babel-loader',
          //       options: {
          //         cwd: this.context.pagesDir,
          //         root: this.context.pagesDir,
          //       },
          //     },
          //   ],
          // },
        ],
      },
      resolve: {
        alias: {
          '@grexie/pages': this.context.pagesDir,
          glob: false,
        },
        fallback: {
          util: false,
          fs: false,
          path: require.resolve('path-browserify'),
        },
        extensions: ['.md', '.ts', '.tsx', '.js', '.jsx', '.cjs', '.mjs'],
        modules: this.context.modulesDirs,
        fullySpecified: false,
      },
      resolveLoader: {
        extensions: ['.mjs', '.js', '.ts'],
        modules: [
          path.resolve(__dirname, 'loaders'),
          ...this.context.modulesDirs,
        ],
      },
      loader: {
        pages: {
          context: this.context,
        },
      },
      optimization: {
        usedExports: true,
      },
      plugins: [new ResourcesPlugin({ context: this.context })],
    };
  }

  async build(sources: Source[]): Promise<WebpackStats> {
    const config = await this.config(sources);
    return this.#builder.build({ config });
  }

  async watch(sources: Source[]): Promise<Watcher> {
    const config = await this.config(sources);
    return this.#builder.watch({ config });
  }

  createModuleContext(compilation: Compilation) {
    return new ModuleContext({ context: this.context, compilation });
  }
}
