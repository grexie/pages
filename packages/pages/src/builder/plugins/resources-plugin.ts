import type { Source } from '../Source.js';
import type { BuildContext } from '../BuildContext.js';
import webpack from 'webpack';
import type { Compiler, Compilation } from 'webpack';
import path from 'path';
import EntryDependency from 'webpack/lib/dependencies/EntryDependency.js';
import html from 'html';

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

    const compiler = compilation.createChildCompiler('SourceCompiler');

    return await new Promise<Buffer>((resolve, reject) => {
      compiler.compile(async (err, compilation) => {
        if (err) {
          reject(err);
          return;
        }

        try {
          const modules = this.context.build.getModuleContext(compilation!);

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

          const output = Buffer.from(
            html.prettyPrint(buffer.toString(), {
              indent_size: 2,
            })
          );
          resolve(output);
        } catch (err) {
          reject(err);
        }
      });
    });
  }

  async makeHook(name: string, compiler: Compiler, compilation: Compilation) {
    await new Promise<webpack.Module>((resolve, reject) =>
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
      { name, stage: Infinity },
      async assets => {
        const files = new Set<string>();

        let publicPath = compilation.outputOptions.publicPath ?? '/';
        if (publicPath === 'auto') {
          publicPath = '/';
        }

        let entrypoints: string[] = [this.source.slug];

        if (process.env.WEBPACK_HOT) {
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

        try {
          compilation.emitAsset(
            path.join(this.source.slug, 'index.html'),
            new RawSource(buffer!)
          );
        } catch (err) {
          console.error(err);
        }
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
