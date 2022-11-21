import { Source, BuildContext, Provider } from '@grexie/pages-builder';
import webpack from 'webpack';
import type { Compiler, Compilation } from 'webpack';
import path from 'path';
import { Renderer } from '@grexie/pages-builder';
import { WritableBuffer } from '@grexie/stream';
import { ResourceDependency } from '@grexie/pages-builder';
import { Config, Mapping, NormalizedMapping } from '@grexie/pages';

const { RawSource } = webpack.sources;

export interface ResourcesPluginOptions {
  context: BuildContext;
  mapping?: {
    source: Source;
    mapping: NormalizedMapping;
    config: Config;
  };
  seen?: Set<string>;
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
}

class SourceCompiler {
  readonly context: CompilationContext;
  readonly source: Source;
  readonly config: Config;

  constructor(context: CompilationContext, source: Source, config: Config) {
    this.context = context;
    this.source = source;
    this.config = config;
  }

  async render(compilation: Compilation, scripts: string[]) {
    if (process.env.PAGES_DEBUG_LOADERS === 'true') {
      console.info('render', this.source.filename);
    }

    const { modules } = this.context;

    const [{ Renderer }, { WritableBuffer }, exports] =
      await modules.requireMany(
        import.meta,
        '@grexie/pages-builder',
        '@grexie/stream',
        this.source.abspath
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
        new ResourceDependency({
          request: this.source.filename,
          context: this.context.build,
          source: this.source,
        }),
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
  readonly mapping?;
  readonly seen;

  constructor({
    context,
    mapping,
    seen = new Set<string>(),
  }: ResourcesPluginOptions) {
    this.context = context;
    this.mapping = mapping;
    this.seen = seen;
  }

  getEntries(compilation: Compilation) {
    return [...compilation.entrypoints].map(([name, entrypoint]) => ({
      [name]: entrypoint.chunks,
    }));
  }

  apply(compiler: Compiler) {
    compiler.hooks.make.tapPromise('ResourcesPlugin', async compilation => {
      compilation.dependencyFactories.set(
        ResourceDependency,
        compilation.params.normalModuleFactory
      );

      const thisContext = this.context.sources.createChild(compilation, {
        providers: [
          {
            provider: Provider,
            ...(this.mapping
              ? {
                  rootDir: path.resolve(
                    this.mapping.source.dirname,
                    this.mapping.mapping.from
                  ),
                  basePath: this.mapping.mapping.to,
                }
              : {}),
          },
        ],
        mapping: this.mapping?.mapping,
        rootDir: this.mapping
          ? path.resolve(this.mapping.source.dirname, this.mapping.mapping.from)
          : this.context.rootDir,
      });

      let sources = await thisContext.registry.list();

      const context = new CompilationContext({
        build: thisContext,
        compilation,
      });

      context.modules.reset();

      const sourceConfigs = (
        await Promise.all(
          sources.map(async source => {
            const config = await (
              await context.build.config.create(compilation, source.path)
            ).create();

            if (this.seen.has(source.slug)) {
              return;
            }

            if (!config.render) {
              return;
            }

            this.seen.add(source.slug);

            return { source, config };
          })
        )
      ).filter(x => !!x);

      const normalizeMapping = (mapping: Mapping): NormalizedMapping => {
        if (typeof mapping === 'string') {
          const [from, to] = mapping.split(/:/g);
          mapping = { from, to };
        } else {
          mapping = { ...mapping };
        }

        if (typeof mapping.to === 'string') {
          mapping.to = mapping.to.split(/\//g);
          mapping.to = mapping.to.filter(x => !!x);
        }

        return mapping as NormalizedMapping;
      };

      const mappings: {
        source: Source;
        config: Config;
        mapping: NormalizedMapping;
      }[] = [];
      const stack = sourceConfigs.slice();
      let el: { config: Config; source: Source } | undefined;
      while ((el = stack.shift())) {
        console.info(el);
        if (el.config.mappings.length) {
          for (const mapping of el.config.mappings) {
            mappings.push({ ...el, mapping: normalizeMapping(mapping) });
          }
        }
      }

      console.info(mappings);

      const promises: Promise<void>[] = [];
      for (const mapping of mappings) {
        thisContext.addCompilationRoot(
          path.resolve(mapping.source.dirname, mapping.mapping.from)
        );
        const compiler = compilation.createChildCompiler(
          'ResourcesPlugin',
          {},
          [
            new ResourcesPlugin({
              context: thisContext,
              mapping,
              seen: this.seen,
            }),
          ]
        );

        promises.push(
          new Promise((resolve, reject) => {
            compiler.runAsChild(err => {
              if (err) {
                reject(err);
                return;
              }

              resolve();
            });
          })
        );
      }

      await Promise.all([
        ...sourceConfigs.map(async ({ source, config }) => {
          const sourceCompiler = new SourceCompiler(context, source, config);
          await sourceCompiler.makeHook(
            'ResourcesPlugin',
            compiler,
            compilation
          );
        }),
        ...promises,
      ]);
    });
  }
}
