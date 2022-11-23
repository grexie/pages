import {
  Builder as BuilderBase,
  Watcher,
  WebpackStats,
} from './BuilderBase.js';
import {
  FileSystem,
  WritableFileSystem,
  FileSystemOptions,
} from './FileSystem.js';
import { CacheStorage, Cache } from './Cache.js';
import type { BuildContext } from './BuildContext.js';
import type { DescriptionFile } from './PluginContext.js';
import _path from 'path';
import { Volume } from 'memfs';
import { ResourcesPlugin } from '@grexie/pages-resources-plugin';
import path from 'path';
import webpack, { dependencies } from 'webpack';
import { createRequire } from 'module';
import ProgressBarPlugin from 'progress-bar-webpack-plugin';
import { EventManager, EventPhase } from './EventManager.js';
import type { Configuration as WebpackConfiguration } from 'webpack';

export type Configuration = WebpackConfiguration & {
  devServer?: webpack.WebpackOptionsNormalized['devServer'];
};

// const originalResolveRequestArray =
//   NormalModuleFactory.prototype.resolveRequestArray;
// NormalModuleFactory.prototype.resolveRequestArray =
//   function resolveRequestArray(
//     this: any,
//     contextInfo: any,
//     context: any,
//     array: any,
//     originalResolver: any,
//     resolveContext: any,
//     callback: any
//   ) {
//     //Object.setPrototypeOf(resolver, Object.getPrototypeOf(originalResolver));
//     const originalResolve = originalResolver.resolve;
//     let resolveRequests: any[] = [];
//     const resolver = {
//       resolve: function (this: any) {
//         const args = [...arguments];
//         const originalCallback = args.pop();
//         args.push(function (
//           this: any,
//           err: any,
//           result: any,
//           resolveRequest: any
//         ) {
//           if (result && resolveRequest) {
//             resolveRequests.push({ result, resolveRequest });
//           }

//           return originalCallback.call(this, err, result, resolveRequest);
//         });
//         return originalResolve.call(originalResolver, ...args);
//       },
//     };

//     return originalResolveRequestArray.call(
//       this,
//       contextInfo,
//       context,
//       array,
//       resolver,
//       resolveContext,
//       function (this: any, err: any, resolved: any[]) {
//         if (resolved) {
//           resolved.forEach(resolved => {
//             if (!resolved) {
//               return;
//             }

//             const resolveRequest = resolveRequests.find(
//               ({ result }) => result === resolved.loader
//             )?.resolveRequest;
//             resolved.type = resolveRequest?.descriptionFileData?.type;
//           });
//         }

//         callback.call(this, err, resolved);
//       }
//     );
//   };

const __dirname = path.dirname(new URL(import.meta.url).pathname);

export const defaultDescriptionFileData: DescriptionFile = {
  dependencies: {
    '@grexie/pages-plugin-markdown': '*',
    '@grexie/pages-plugin-typescript': '*',
    '@grexie/pages-plugin-image': '*',
    '@grexie/pages-plugin-sass': '*',
  },
};

export class Builder {
  readonly context: BuildContext;
  readonly defaultFiles: WritableFileSystem;
  readonly #builder: BuilderBase;
  readonly #events = EventManager.get<Builder>(this);
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
      JSON.stringify(defaultDescriptionFileData, null, 2)
    );

    this.#builder.fs.add(
      this.context.rootDir,
      new FileSystem()
        .add('/', this.defaultFiles, false, 'defaultFiles')
        .add(this.context.rootDir, fs, false, 'rootDir'),
      false,
      'fs:defaultFiles+root'
    );

    this.#builder.fs.add('/', fs, false);

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

    fs.mkdirSync(this.context.cacheDir, { recursive: true });

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

  loader(loader: string, options: any = {}): webpack.RuleSetUseItem {
    return {
      loader,
      options: {
        context: this.context,
        ...options,
      },
    } as any;
  }

  async config(): Promise<Configuration> {
    const require = createRequire(import.meta.url);
    const production = process.env.NODE_ENV === 'production';
    const hot = !production && process.env.WEBPACK_HOT === 'true';

    const config: Configuration = {
      context: this.context.rootDir,
      entry: {},
      stats: {
        children: true,
      },
      mode: production ? 'production' : 'development',
      output: {
        path: this.context.outputDir,
        filename: `assets/js/[name].js`,
        clean: !!production,
      },
      target: 'web',
      watchOptions: {
        ignored: [
          this.context.outputDir,
          this.context.cacheDir,
          path.resolve(this.context.rootDir, 'node_modules', '.cache'),
        ],
      },
      module: {
        rules: [],
      },
      resolve: {
        alias: {
          glob: false,
          'create-hash/md5': require.resolve('create-hash/md5'),
          'create-hash': require.resolve('create-hash/browser'),
        },
        conditionNames: ['deno', 'default', 'require', 'import'],
        mainFields: ['module', 'main'],
        extensions: this.context.resolverConfig.extensions,
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
        extensions: ['.cjs', '.js', '.ts'],
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
        minimize: !!production,
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
        new ProgressBarPlugin({
          format: '  build [:bar] :percent (:elapsed seconds) :msg',
          clear: true,
          total: 0,
        }) as any,
        new ResourcesPlugin({ context: this.context }),
        new webpack.DefinePlugin({ 'process.env': `({})` }),
      ],
    };

    if (hot) {
      config.devServer = config.devServer ?? {};
      config.devServer.hot = true;
      Object.assign(config.entry!, {
        '__webpack/react-refresh': {
          import: '@grexie/pages-runtime-hmr',
          filename: '__webpack/react-refresh.js',
        },
        '__webpack/hot': {
          import:
            'webpack-hot-middleware/client?reload=true&path=__webpack/hmr',
          filename: '__webpack/hot.js',
        },
      });

      config.plugins!.push(new webpack.HotModuleReplacementPlugin());
    }

    await this.#events.emit(EventPhase.after, 'config', config);
    return config;
  }

  async build(): Promise<WebpackStats> {
    await this.context.ready;
    const config = await this.config();
    return this.#builder.build({ config });
  }

  async watch(): Promise<Watcher> {
    await this.context.ready;
    const config = await this.config();
    return this.#builder.watch({ config });
  }

  async createCompiler(): Promise<webpack.Compiler> {
    await this.context.ready;
    const config = await this.config();
    return this.#builder.compiler({ config });
  }
}
