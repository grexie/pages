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
import { ResourcesPlugin } from '../loaders/resources-plugin';
import path from 'path';

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
    fsOptions: FileSystemOptions[]
  ) {
    this.context = context;
    this.#builder = new BuilderBase();
    const { defaultFiles, cache } = this.#createFileSystem(fs, fsOptions);
    this.defaultFiles = defaultFiles;
    this.cache = cache;
  }

  #createFileSystem(fs: WritableFileSystem, fsOptions: FileSystemOptions[]) {
    this.#builder.fs.add(_path.resolve(this.context.pagesDir, '..', '..'), fs);

    const defaultFiles = new Volume() as WritableFileSystem;
    defaultFiles.mkdirSync(this.context.rootDir, { recursive: true });
    defaultFiles.writeFileSync(
      _path.resolve(this.context.rootDir, 'package.json'),
      '{}'
    );

    this.#builder.fs.add(
      this.context.rootDir,
      new FileSystem().add('/', defaultFiles).add(this.context.rootDir, fs),
      true
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

    return { defaultFiles, cache };
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
      // [slug]: {
      //   import: `resource-loader!./${_path.relative(
      //     this.context.rootDir,
      //     source.filename
      //   )}`,
      // },
    };
  }

  #loader(loader: string, options: any = {}) {
    return {
      loader,
      options: {
        context: this.context,
        ...options,
      },
    };
  }

  async config(sources: Source[]): Promise<Configuration> {
    return {
      context: this.context.rootDir,
      entry: {
        ...sources
          .map(source => this.entry(source))
          .reduce((a, b) => ({ ...a, ...b }), {}),
      },
      mode: 'production',
      output: {
        path: this.context.outputDir,
        filename: `[name].html`,
      },
      externals: [
        nodeExternals({
          modulesDir: this.context.modulesDirs[0],
          additionalModuleDirs: this.context.modulesDirs.slice(1),
        }),
      ],
      module: {
        rules: [
          {
            test: require.resolve('../defaults.pages'),
            use: [
              this.#loader('cache-loader'),
              this.#loader('pages-loader'),
              {
                loader: 'babel-loader',
                options: {
                  presets: ['@babel/typescript', '@babel/env'],
                  cwd: this.context.pagesDir,
                  root: this.context.rootDir,
                },
              },
            ],
          },
          {
            test: /(^\.?|\/\.?|\.)pages.ya?ml$/,
            exclude: /(node_modules|bower_components)/,
            use: [
              this.#loader('cache-loader'),
              this.#loader('pages-loader'),
              'yaml-loader',
            ],
          },
          {
            test: /\.(html)$/,
            exclude: /(node_modules|bower_components)/,
            use: [this.#loader('cache-loader'), this.#loader('html-loader')],
          },
          {
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
            test: /\.(js|jsx|mjs|cjs)$/,
            include: [/node_modules\/@mdx-js/],
            exclude: /(node_modules|bower_components)/,
            use: [
              this.#loader('cache-loader'),
              this.#loader('module-loader'),
              {
                loader: 'babel-loader',
                options: {
                  presets: ['@babel/react', '@babel/env'],
                  cwd: this.context.pagesDir,
                  root: this.context.rootDir,
                },
              },
            ],
          },
          {
            test: /\.(ts|tsx)$/,
            exclude: /(node_modules|bower_components)/,
            use: [
              this.#loader('cache-loader'),
              this.#loader('module-loader'),
              {
                loader: 'babel-loader',
                options: {
                  presets: ['@babel/typescript', '@babel/react', '@babel/env'],
                  cwd: this.context.pagesDir,
                  root: this.context.rootDir,
                },
              },
            ],
          },
        ],
      },
      resolve: {
        extensions: ['.md', '.ts', '.tsx', '.js', '.jsx', '.cjs', '.mjs'],
        modules: this.context.modulesDirs,
      },
      resolveLoader: {
        modules: [
          ...this.context.modulesDirs,
          _path.resolve(__dirname, '..', 'loaders'),
        ],
      },
      loader: {
        pages: {
          context: this.context,
        },
      },
      plugins: [new ResourcesPlugin({ context: this.context })],
    };
  }

  async build(sources: Source[]): Promise<WebpackStats> {
    sources = sources.filter(source =>
      /\.(js|jsx|tsx|ts|md)$/.test(source.filename)
    );
    const config = await this.config(sources);
    return this.#builder.build({ config });
  }

  async watch(sources: Source[]): Promise<Watcher> {
    sources = sources.filter(source =>
      /\.(js|jsx|tsx|ts|md)$/.test(source.filename)
    );
    const config = await this.config(sources);
    return this.#builder.watch({ config });
  }
}
