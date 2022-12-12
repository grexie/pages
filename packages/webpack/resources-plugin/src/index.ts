import { Source, BuildContext, Provider } from '@grexie/pages-builder';
import webpack, { sources, web } from 'webpack';
import type { Compiler, Compilation } from 'webpack';
import path from 'path';
import { Renderer } from '@grexie/pages-builder';
import { WritableBuffer } from '@grexie/stream';
import EntryDependency from 'webpack/lib/dependencies/EntryDependency.js';
import { Config, Mapping, NormalizedMapping } from '@grexie/pages';
import { ObjectProxy } from '@grexie/proxy';
import { compilation } from 'webpack';
import { SSRBabelPlugin } from './babel.js';
import { transformAsync } from '@babel/core';
import { compiler } from 'webpack';
import { hash } from '@grexie/hash-object';

const { RawSource } = webpack.sources;

export interface ResourcesPluginOptions {
  context: BuildContext;
  sources?: Set<Source>;
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
      console.debug('render', this.source.filename);
    }

    const { modules } = this.context;

    const [exports] = await modules.requireMany(
      import.meta,
      this.source.abspath
    );

    if (process.env.PAGES_DEBUG_LOADERS === 'true') {
      console.debug('render:rendering', this.source.filename);
    }

    // const renderer = new Renderer(this.context.build);

    const buffer = await this.context.build.renderer.render(
      new WritableBuffer(),
      exports.resource,
      scripts,
      exports.default
    );

    if (process.env.PAGES_DEBUG_LOADERS === 'true') {
      console.debug('render:rendered', this.source.filename);
    }

    return buffer.toString();
  }

  async makeHook(name: string, compiler: Compiler, compilation: Compilation) {
    const entryModule = await new Promise<webpack.Module>((resolve, reject) =>
      compilation.addEntry(
        this.context.build.root.rootDir,
        new EntryDependency(this.source.filename),
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

    compilation.fileDependencies.addAll(
      entryModule?.buildInfo.fileDependencies ?? []
    );
    compilation.buildDependencies.addAll(
      entryModule?.buildInfo.buildDependencies ?? []
    );
    compilation.contextDependencies.addAll(
      entryModule?.buildInfo.contextDependencies ?? []
    );

    compilation.hooks.processAssets.tapPromise(
      {
        name: 'SourceCompiler',
        stage: compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_ADDITIONAL,
      },
      async () => {
        try {
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

          compilation.emitAsset(
            path.join(this.source.slug, 'index.html'),
            new RawSource(buffer!)
          );
        } catch (err) {
          const stringifiedErr = (err as any).toString();

          if (
            !compilation.errors.reduce(
              (a, b) => a || b.toString() === stringifiedErr,
              false
            )
          ) {
            compilation.errors.push(err as any);
          }
        }
      }
    );
  }
}

export class ResourcesPlugin {
  readonly context: BuildContext;
  readonly sources?: Set<Source>;
  readonly compilations = new Set<CompilationContext>();
  readonly mappingsSeen = new Set<string>();
  constructor({ context, sources }: ResourcesPluginOptions) {
    this.context = context;
    this.sources = sources;
  }

  getEntries(compilation: Compilation) {
    return [...compilation.entrypoints].map(([name, entrypoint]) => ({
      [name]: entrypoint.chunks,
    }));
  }

  async makeHook(
    name: string,
    compiler: Compiler,
    compilation: Compilation,
    parentContext: BuildContext = this.context,
    mapping?: NormalizedMapping,
    seen: Set<string> = new Set<string>()
  ): Promise<
    {
      context: CompilationContext;
      source: Source;
      config: Config;
    }[]
  > {
    const thisContext = parentContext.sources.createChild(compilation, {
      providers: [
        {
          provider: Provider,
          ...(mapping
            ? {
                rootDir: mapping.from,
                basePath: mapping.to,
              }
            : {}),
        },
      ],
      mapping: mapping,
      rootDir: mapping ? mapping.from : this.context.rootDir,
    });

    let sources = [...(this.sources ?? (await thisContext.registry.list()))];
    let configs = await thisContext.registry.listConfig();

    const context = new CompilationContext({
      build: thisContext,
      compilation,
    });

    this.compilations.add(context);

    context.modules.reset();

    const sourceConfigs = (
      await Promise.all(
        sources.map(async source => {
          if (seen.has(source.slug)) {
            return;
          }

          seen.add(source.slug);

          const config = await (
            await context.build.config.create(compilation, source.path)
          ).create();

          if (!config.render) {
            return;
          }

          return { context, source, config };
        })
      )
    ).filter(x => !!x) as {
      context: CompilationContext;
      source: Source;
      config: Config;
    }[];

    sourceConfigs.push(
      ...((
        await Promise.all(
          configs.map(async configSource => {
            if (seen.has(`config:${configSource.abspath}`)) {
              return;
            }
            seen.add(`config:${configSource.abspath}`);

            const config = await (
              await context.build.config.create(compilation, configSource.path)
            ).create();

            return { context, source: configSource, config };
          })
        )
      ).filter(x => !!x) as {
        context: CompilationContext;
        source: Source;
        config: Config;
      }[])
    );

    const normalizeMapping = (
      source: Source,
      mapping: Mapping
    ): NormalizedMapping => {
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

      mapping.from = path.resolve(source.dirname, mapping.from);

      return mapping as NormalizedMapping;
    };

    const mappings: NormalizedMapping[] = [];
    const stack = sourceConfigs.slice();
    let el: { config: Config; source: Source } | undefined;

    let seenConfig = new Set<string>();
    while ((el = stack.shift())) {
      if (seenConfig.has(el.source.slug)) {
        continue;
      }
      seenConfig.add(el.source.slug);

      for (const mapping of el.config.mappings ?? []) {
        const serialized = `${mapping.from}:${mapping.to}`;
        if (this.mappingsSeen.has(serialized)) {
          continue;
        }
        console.info(serialized);
        this.mappingsSeen.add(serialized);
        mappings.push(mapping);
      }
    }

    const promises: Promise<
      {
        context: CompilationContext;
        source: Source;
        config: Config;
      }[]
    >[] = [];
    for (const mapping of mappings) {
      thisContext.addCompilationRoot(mapping.from);

      promises.push(
        this.makeHook(
          'ResourcesPlugin',
          compiler,
          compilation,
          thisContext,
          mapping,
          seen
        )
      );
    }

    return (await Promise.all(promises)).reduce(
      (a, b) => [
        ...a,
        ...b,
        ...sourceConfigs.filter(({ source }) => !source.isPagesConfig),
      ],
      []
    );
  }

  apply(compiler: Compiler) {
    compiler.hooks.watchRun.tapPromise('ResourcesPlugin', async compilation => {
      this.compilations.forEach(({ build }) => {
        build.dispose();
      });
      this.compilations.clear();
      this.mappingsSeen.clear();
      console.info(
        'root context has',
        this.context.sources.descendants.length,
        'descendants'
      );

      // compilation.hooks.afterDone.tap('ResourcesPlugin', () => {
      //   sourceConfigs.forEach(({ context }) => context.build.dispose());
      // });
    });

    compiler.hooks.afterDone.tap('ResourcesPlugin', async () => {});

    compiler.hooks.make.tapPromise('ResourcesPlugin', async compilation => {
      compilation.dependencyFactories.set(
        EntryDependency,
        compilation.params.normalModuleFactory
      );

      const sourceConfigs = await this.makeHook(
        'ResourcesPlugin',
        compiler,
        compilation
      );

      console.info(
        'root context has',
        this.context.sources.descendants.length,
        'descendants'
      );

      const seen = new Set<string>();
      await Promise.all(
        sourceConfigs.map(async ({ context, source, config }) => {
          if (seen.has(source.slug)) {
            return;
          }
          seen.add(source.slug);

          const sourceCompiler = new SourceCompiler(context, source, config);
          await sourceCompiler.makeHook(
            'ResourcesPlugin',
            compiler,
            compilation
          );
        })
      );
    });

    compiler.hooks.compilation.tap('ResourcesPlugin:SSR', compilation => {
      const hooks =
        compiler.webpack.javascript.JavascriptModulesPlugin.getCompilationHooks(
          compilation
        );

      hooks.chunkHash.tap('ResourcesPlugin:SSR', (chunk, hash) => {
        hash.update('ResourcesPlugin:SSR');
      });

      compilation.hooks.processAssets.tapPromise(
        {
          name: 'ResourcesPlugin:SSR',
          stage: compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_PRE_PROCESS,
          additionalAssets: true,
        },
        async assets => {
          await Promise.all(
            Object.keys(assets).map(async name => {
              const asset = compilation.getAsset(name);

              if (!asset || !name.endsWith('.js')) {
                return;
              }

              const { source, map } = asset.source.sourceAndMap();

              const compiled = await transformAsync(source.toString(), {
                plugins: [SSRBabelPlugin({ context: this.context })],
                compact: true,
                inputSourceMap: (map as any) || false,
                sourceMaps: !!compiler.options.devtool,
              });

              let output: webpack.sources.Source;
              if (compiled?.map) {
                output = new webpack.sources.SourceMapSource(
                  compiled!.code!,
                  asset.name,
                  compiled!.map
                );
              } else {
                output = new webpack.sources.RawSource(compiled!.code!);
              }

              compilation.updateAsset(name, output, asset.info);
            })
          );
        }
      );
    });
  }
}
