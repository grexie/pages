import {
  Builder as BuilderBase,
  Watcher,
  Stats,
  Configuration,
  EntryObject,
} from '@grexie/builder';
import { BuildContext } from './BuildContext';
import { Source } from '../api';
import nodeExternals from 'webpack-node-externals';
import _path from 'path';

const mountPoints = () => {
  return ['/Users/tim/src/grexie/grexie-pages'];
};

export class Builder {
  readonly context: BuildContext;
  readonly #builder: BuilderBase;

  constructor(context: BuildContext) {
    this.context = context;
    this.#builder = new BuilderBase({
      mounts: [this.context.rootDir, ...mountPoints()].map(path => ({
        path,
        readonly: true,
      })),
    });
  }

  filenameToPath(
    filename: string,
    rootDir: string = this.context.rootDir
  ): string[] {
    const path = _path
      .relative(rootDir, filename)
      .split(/\//g)
      .map(p => p.replace(/\..*$/g, ''));

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
      if (path.length === 0) {
        path = ['index'];
      }
      const slug = path.join('/');
      filename = `${slug}.js`;
    }

    if (!filename) {
      throw new Error('filename or path must be provided');
    }

    filename = _path.resolve(this.context.outputDir, filename);

    const readFile = (): Promise<Buffer> =>
      new Promise((resolve, reject) =>
        this.#builder.store.readFile(filename!, (err, buffer) => {
          if (err) {
            reject(err);
            return;
          }

          resolve(buffer!);
        })
      );

    try {
      const buffer = await readFile();
      return buffer;
    } catch (err) {
      if (!wait) {
        throw err;
      }

      await new Promise(resolve => {
        this.#builder.store.once(`write:${filename}`, () => resolve);
      });
      const buffer = await readFile();
      return buffer;
    }
  }

  entry(source: Source): EntryObject {
    let path = source.path.slice();
    if (path.length === 0) {
      path = ['index'];
    }
    const slug = path.join('/');
    return {
      [slug]: source.filename,
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
        filename: `[name].js`,
        libraryTarget: this.context.isServer ? 'commonjs' : undefined,
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
            test: /\.(md|mdx)$/,
            exclude: /(node_modules|bower_components)/,
            use: {
              loader: 'pages-loader',
              options: {
                context: this.context,
                handler: '@grexie/pages/handlers/markdown',
              },
            },
          },
          {
            test: /\.(js|jsx|mjs|cjs)$/,
            exclude: /(node_modules|bower_components)/,
            use: [
              {
                loader: 'pages-loader',
                options: {
                  context: this.context,
                },
              },
              {
                loader: 'babel-loader',
                options: {
                  presets: ['@babel/preset-react', '@babel/preset-env'],
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
              {
                loader: 'pages-loader',
                options: {
                  context: this.context,
                },
              },
              {
                loader: 'babel-loader',
                options: {
                  presets: [
                    '@babel/preset-typescript',
                    '@babel/preset-react',
                    '@babel/preset-env',
                  ],
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
    };
  }

  async build(sources: Source[]): Promise<Stats> {
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
