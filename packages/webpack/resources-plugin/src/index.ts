import type { Source, BuildContext } from '@grexie/pages-builder';
import webpack from 'webpack';
import type { Compiler, Compilation } from 'webpack';
import path from 'path';
import EntryDependency from 'webpack/lib/dependencies/EntryDependency.js';

const { RawSource } = webpack.sources;

export interface ResourcesPluginOptions {
  context: BuildContext;
}

export interface CompilationContextOptions {
  build: BuildContext;
  compilation: Compilation;
}

class CompilationContext {
  readonly build: BuildContext;
  readonly compilation: Compilation;
  readonly compilers: Record<string, Compiler> = {};
  readonly promises: Record<string, Promise<void>> = {};

  constructor({ build, compilation }: CompilationContextOptions) {
    this.build = build;
    this.compilation = compilation;
  }

  get modules() {
    return this.build.getModuleContext(this.compilation);
  }

  get renderer() {
    return this.build.renderer;
  }
}

class SourceCompiler {
  readonly context: CompilationContext;
  readonly source: Source;

  constructor(context: CompilationContext, source: Source) {
    this.context = context;
    this.source = source;
  }

  async render(compilation: Compilation, scripts: string[]) {
    if (process.env.PAGES_DEBUG_LOADERS === 'true') {
      console.info('render', this.source.filename);
    }

    const { modules } = this.context;

    const [{ Renderer }, { WritableBuffer }, exports] =
      await modules.requireMany(
        import.meta,
        '../Renderer.js',
        '../../utils/stream.js',
        this.source.filename
      );

    if (process.env.PAGES_DEBUG_LOADERS === 'true') {
      console.info('render:rendering', this.source.filename);
    }

    const renderer = new Renderer(this.context.build);

    const buffer = await renderer.render(
      new WritableBuffer(),
      exports.resource,
      scripts,
      exports.default
    );

    if (process.env.PAGES_DEBUG_LOADERS === 'true') {
      console.info('render:rendered', this.source.filename);
    }

    return buffer.toString();
  }

  async makeHook(name: string, compiler: Compiler, compilation: Compilation) {
    const entryModule = await new Promise<webpack.Module>((resolve, reject) =>
      compilation.addEntry(
        this.context.build.rootDir,
        new EntryDependency(
          `./${path.relative(this.context.build.rootDir, this.source.filename)}`
        ),
        {
          name: this.source.slug,
          filename: this.source.slug
            ? `${this.source.slug}/index.js`
            : 'index.js',
        },
        (err, result) => {
          if (err) {
            reject(err);
            return;
          }

          resolve(result!);
        }
      )
    );

    compilation.hooks.processAssets.tapPromise(
      { name: 'SourceCompiler', stage: Infinity },
      async () => {
        // let hasChanged = false;
        // for (const chunk of compilation.entrypoints.get(this.source.slug)
        //   ?.chunks ?? []) {
        //   if (chunk.rendered) {
        //     hasChanged = true;
        //     break;
        //   }
        // }

        // if (!hasChanged) {
        //   const cache = this.context.build.cache.create('html');
        //   try {
        //     const buffer = await cache.get(
        //       path.resolve(
        //         this.context.build.rootDir,
        //         this.source.slug,
        //         'index.html'
        //       )
        //     );

        //     compilation.emitAsset(
        //       path.join(this.source.slug, 'index.html'),
        //       new RawSource(buffer),
        //       {
        //         sourceFilename: `./${path.relative(
        //           this.context.build.rootDir,
        //           this.source.filename
        //         )}`,
        //         related: { entry: path.join(this.source.slug, 'index.js') },
        //       }
        //     );
        //     return;
        //   } catch (err) {}
        // }

        // console.info('building', this.source.filename);

        const files = new Set<string>();

        let publicPath = compilation.outputOptions.publicPath ?? '/';
        if (publicPath === 'auto') {
          publicPath = '/';
        }

        let entrypoints: string[] = [this.source.slug];

        if (compilation.options.devServer?.hot) {
          entrypoints = [
            '__webpack/react-refresh',
            '__webpack/hot',
            ...entrypoints,
          ];
        }

        entrypoints.forEach(name => {
          const entrypoint = compilation.entrypoints.get(name);

          entrypoint?.chunks.forEach(chunk => {
            chunk.files.forEach(file => {
              const asset = compilation.getAsset(file);
              if (!asset) {
                return;
              }

              const assetMetaInformation = asset.info || {};
              if (
                assetMetaInformation.hotModuleReplacement ||
                assetMetaInformation.development
              ) {
                return;
              }

              files.add(`${publicPath}${file}`);
            });
          });
        });

        const buffer = await this.render(compilation, [...files]);

        const cache = this.context.build.cache.create('html');
        await cache.set(
          path.resolve(
            this.context.build.rootDir,
            this.source.slug,
            'index.html'
          ),
          buffer!
        );
        compilation.emitAsset(
          path.join(this.source.slug, 'index.html'),
          new RawSource(buffer!)
          // {
          //   sourceFilename: `./${path.relative(
          //     this.context.build.rootDir,
          //     this.source.filename
          //   )}`,

          // }
        );
      }
    );
  }
}

export class ResourcesPlugin {
  readonly context: BuildContext;

  constructor({ context }: ResourcesPluginOptions) {
    this.context = context;
  }

  getEntries(compilation: Compilation) {
    return [...compilation.entrypoints].map(([name, entrypoint]) => ({
      [name]: entrypoint.chunks,
    }));
  }

  apply(compiler: Compiler) {
    compiler.hooks.make.tapPromise('ResourcesPlugin', async compilation => {
      compilation.dependencyFactories.set(
        EntryDependency,
        compilation.params.normalModuleFactory
      );

      let sources = await this.context.registry.list();

      const context = new CompilationContext({
        build: this.context,
        compilation,
      });

      console.info('here');

      sources = (
        await Promise.all(
          sources.map(async source => {
            const config = await (
              await context.build.config.create(compilation, source.path)
            ).create();

            if (config.render) {
              return source;
            }
          })
        )
      ).filter(x => !!x) as Source[];

      console.info('not here');

      // context.modules.reset();

      await Promise.all(
        sources.map(async source => {
          const sourceCompiler = new SourceCompiler(context, source);
          await sourceCompiler.makeHook(
            'ResourcesPlugin',
            compiler,
            compilation
          );
        })
      );
    });
  }
}
