import {
  Builder as BuilderBase,
  Watcher,
  Configuration,
  EntryObject,
  WebpackStats,
} from '@grexie/builder/Builder.js';
import {
  FileSystem,
  WritableFileSystem,
  FileSystemOptions,
} from '@grexie/builder/FileSystem.js';
import { CacheStorage, Cache } from '@grexie/builder/Cache.js';
import { BuildContext } from './BuildContext.js';
import { Source } from './Source.js';
import _path from 'path';
import { Volume } from 'memfs';
import { ResourcesPlugin } from './plugins/resources-plugin.js';
import { ModuleContext } from './ModuleContext.js';
import { Compilation } from 'webpack';
import path from 'path';
import webpack from 'webpack';
import { createRequire } from 'module';

const __dirname = path.dirname(new URL(import.meta.url).pathname);

export class Builder {
  readonly context: BuildContext;
  readonly defaultFiles: WritableFileSystem;
  readonly buildFiles = new FileSystem();
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
    this.defaultFiles.mkdirSync(this.context.rootDir, {
      recursive: true,
    });
    this.defaultFiles.writeFileSync(
      _path.resolve(this.context.rootDir, 'package.json'),
      '{}'
    );

    this.#builder.fs.add('/', this.buildFiles, false, 'buildFiles');

    this.#builder.fs.add(
      this.context.rootDir,
      new FileSystem()
        .add('/', this.defaultFiles, false, 'defaultFiles')
        .add(this.context.rootDir, fs, false, 'rootDir'),
      false,
      'fs:defaultFiles+root'
    );

    if ((process.env.NODE_ENV ?? 'development') === 'development') {
      this.#builder.fs.add(
        _path.resolve(this.context.pagesDir, '..', '..'),
        fs,
        false,
        'pagesDir'
      );
    }

    fsOptions.forEach(options =>
      this.#builder.fs.add(
        options.path,
        options.fs,
        options.writable,
        options.name
      )
    );

    const cacheStorage: CacheStorage = {
      ephemeral: new FileSystem()
        .add('/', new Volume(), true)
        .add(this.context.cacheDir, fs, true),
      persistent: new FileSystem()
        .add('/', new Volume(), true)
        .add(this.context.cacheDir, fs, true),
    };

    this.#builder.fs.add(
      this.context.cacheDir,
      cacheStorage.persistent,
      true,
      'cache:persistent'
    );

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

  #loader(loader: string, options: any = {}): webpack.RuleSetUseItem {
    return {
      loader: loader,
      options: {
        context: this.context,
        ...options,
      },
    } as any;
  }

  async config(sources: Source[]): Promise<webpack.Configuration> {
    const require = createRequire(import.meta.url);

    const config: webpack.Configuration & {
      devServer?: webpack.WebpackOptionsNormalized['devServer'];
    } = {
      context: this.context.rootDir,
      entry: {},
      stats: {
        children: true,
      },
      mode: 'development',
      devtool: 'source-map',
      output: {
        path: this.context.outputDir,
        filename: `assets/js/[name].js`,
      },
      target: 'web',
      // externals: [
      //   nodeExternals({
      //     modulesDir: this.context.modulesDirs[0],
      //     additionalModuleDirs: this.context.modulesDirs.slice(1),
      //   }),
      // ]

      module: {
        rules: [
          {
            type: 'javascript/auto',
            test: /\.scss$/,
            use: [
              this.#loader('cache-loader'),
              this.#loader('style-loader'),
              {
                loader: 'css-loader',
              },
              {
                loader: 'sass-loader',
              },
            ],
            include: /\.global\.scss$/,
          },
          {
            type: 'javascript/auto',
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
              {
                loader: 'sass-loader',
              },
            ],
            include: /\.module\.scss$/,
          },
          {
            type: 'javascript/auto',
            test: /\.css$/,
            use: [
              this.#loader('cache-loader'),
              this.#loader('style-loader'),
              {
                loader: 'css-loader',
              },
            ],
            include: /\.global\.css$/,
          },
          {
            type: 'javascript/auto',
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
            type: 'javascript/auto',
            test: /\.(png|jpe?g|gif|webp|svg)$/,
            use: [
              this.#loader('cache-loader'),
              this.#loader('image-loader'),
              'raw-loader',
            ],
          },
          {
            type: 'javascript/auto',
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
            type: 'javascript/auto',
            test: /(^\.?|\/\.?|\.)pages.ya?ml$/,
            exclude: /(node_modules|bower_components)/,
            use: [
              this.#loader('cache-loader'),
              this.#loader('pages-loader'),
              this.#loader('yaml-loader'),
            ],
          },
          {
            type: 'javascript/auto',
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
            type: 'javascript/auto',
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
                    ['@babel/react', { runtime: 'automatic' }],
                    [
                      '@babel/env',
                      {
                        targets: 'node 16',
                        modules: false,
                      },
                    ],
                  ],
                  plugins: ['react-refresh/babel'],
                  cwd: this.context.pagesDir,
                  root: this.context.rootDir,
                },
              },
            ],
          },
          {
            type: 'javascript/auto',
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
                    ['@babel/react', { runtime: 'automatic' }],
                    [
                      '@babel/env',
                      {
                        targets: 'node 16',
                        modules: false,
                      },
                    ],
                  ],
                  plugins: ['react-refresh/babel'],
                  cwd: this.context.pagesDir,
                  root: this.context.rootDir,
                  sourceMaps: true,
                },
              },
            ],
          },
        ],
      },
      resolve: {
        alias: {
          '@grexie/pages': this.context.pagesDir,
          glob: false,
          'create-hash/md5': require.resolve('create-hash/md5'),
          'create-hash': require.resolve('create-hash/browser'),
        },
        conditionNames: ['deno', 'default', 'require', 'import'],
        mainFields: ['module', 'main'],
        extensions: ['.md', '.js', '.jsx', '.ts', '.tsx', '.cjs', '.mjs'],
        modules: this.context.modulesDirs,
        fallback: {
          fs: false,
          os: false,
          assert: false,
          path: require.resolve('path-browserify'),
          timers: require.resolve('timers-browserify'),
          crypto: require.resolve('crypto-browserify'),
          'stream/web': false,
          stream: require.resolve('stream-browserify'),
          tty: require.resolve('tty-browserify'),
        },
        fullySpecified: false,
      },
      cache: false,
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
        // minimize: true,
        splitChunks: {
          chunks: 'all',
          minSize: 20000,
          minRemainingSize: 0,
          minChunks: 1,
          maxAsyncRequests: 30,
          maxInitialRequests: 30,
          enforceSizeThreshold: 50000,
          cacheGroups: {
            defaultVendors: {
              test: /[\\/]node_modules[\\/]/,
              filename: 'assets/js/vendor-[chunkhash].js',
              priority: -10,
              reuseExistingChunk: true,
            },
            default: {
              filename: 'assets/js/site-[chunkhash].js',
              minChunks: 2,
              priority: -20,
              reuseExistingChunk: true,
            },
          },
        },
        runtimeChunk: {
          name: 'runtime',
        },
      },
      plugins: [
        new webpack.ProgressPlugin({
          entries: false,
          modules: false,
          dependencies: false,
          // profile: true,
        }),
        new ResourcesPlugin({ context: this.context }),
        new webpack.DefinePlugin({ 'process.env': `({})` }),
      ],
    };

    if (process.env.WEBPACK_HOT === 'true') {
      Object.assign(config.entry!, {
        '__webpack/react-refresh': {
          import: '@grexie/pages/runtime/hmr.js',
          filename: '__webpack/react-refresh.js',
        },
        '__webpack/hot': {
          import:
            'webpack-hot-middleware/client?reload=true&path=__webpack/hmr',
          filename: '__webpack/hot.js',
        },
      });

      config.plugins!.push(new webpack.HotModuleReplacementPlugin());

      (config as any).devServer = Object.assign(
        (config as any).devServer ?? {},
        { hotOnly: false }
      );
    }

    Object.assign(config, {});

    console.info(config.devServer);
    return config;
  }

  async build(sources: Source[]): Promise<WebpackStats> {
    const config = await this.config(sources);
    return this.#builder.build({ config });
  }

  async watch(sources: Source[]): Promise<Watcher> {
    const config = await this.config(sources);
    return this.#builder.watch({ config });
  }

  async compiler(sources: Source[]): Promise<webpack.Compiler> {
    const config = await this.config(sources);
    return this.#builder.compiler({ config });
  }
}
