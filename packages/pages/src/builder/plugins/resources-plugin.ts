import type { Source } from '../../api/Source.js';
import type { BuildContext } from '../BuildContext.js';
import webpack from 'webpack';
import type { Compiler, Compilation } from 'webpack';
import path from 'path';
import { createResolver } from '../../utils/resolvable.js';
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

  async render(scripts: string[]) {
    // const react = await this.context.modules.require(import.meta, 'react');
    const { ResourceContext } = await this.context.modules.require(
      import.meta,
      '../../hooks/useResource.js'
    );
    console.info(ResourceContext);
    const { Renderer } = await this.context.modules.require(
      import.meta,
      '../Renderer.js'
    );
    const { WritableBuffer } = await this.context.modules.require(
      import.meta,
      '../../utils/stream.js'
    );

    if (process.env.PAGES_DEBUG_LOADERS === 'true') {
      console.info('render', this.source.filename);
    }

    const handlerModule = await this.context.modules.requireModule(
      path.dirname(this.source.filename),
      this.source.filename
    );

    if (process.env.PAGES_DEBUG_LOADERS === 'true') {
      console.info('render:handler', this.source.filename);
    }

    const { exports } = handlerModule;

    const resourceContext = new ResourceContext();

    if (process.env.PAGES_DEBUG_LOADERS === 'true') {
      console.info('render:rendering', this.source.filename);
    }

    const renderer = new Renderer(this.context.build);

    const buffer = await renderer.render(
      new WritableBuffer(),
      resourceContext,
      exports.resource,
      scripts,
      exports.default
    );

    if (process.env.PAGES_DEBUG_LOADERS === 'true') {
      console.info('render:rendered', this.source.filename);
    }

    return buffer;
  }

  async makeHook(name: string, compiler: Compiler, compilation: Compilation) {
    // await new Promise<webpack.Module>((resolve, reject) =>
    //   compilation.addEntry(
    //     this.context.build.rootDir,
    //     new EntryDependency(
    //       `./${path.relative(this.context.build.rootDir, this.source.filename)}`
    //     ),
    //     {
    //       name: this.source.slug,
    //       filename: this.source.slug
    //         ? `${this.source.slug}/index.js`
    //         : 'index.js',
    //     },
    //     (err, result) => {
    //       if (err) {
    //         reject(err);
    //         return;
    //       }

    //       resolve(result!);
    //     }
    //   )
    // );

    compilation.hooks.processAssets.tapPromise(
      { name, stage: Infinity },
      async () => {
        const files = new Set<string>();

        let publicPath = compilation.outputOptions.publicPath ?? '/';
        if (publicPath === 'auto') {
          publicPath = '/';
        }

        const entrypoints = []; //[this.source.slug];

        if (process.env.WEBPACK_HOT) {
          entrypoints.unshift('__webpack/react-refresh', '__webpack/client');
        }

        entrypoints.forEach(name => {
          const entrypoint = compilation.entrypoints.get(name)!;

          entrypoint.chunks.forEach(chunk => {
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

        console.error('BEGIN PROCESS ASSETS');
        const buffer = await this.render([...files]);

        compilation.emitAsset(
          path.join(this.source.slug, 'index.html'),
          new RawSource(buffer!)
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
