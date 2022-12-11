import { Source, BuildContext, Provider } from '@grexie/pages-builder';
import webpack, { sources } from 'webpack';
import type { Compiler, Compilation } from 'webpack';
import path from 'path';
import { Renderer } from '@grexie/pages-builder';
import { WritableBuffer } from '@grexie/stream';
import EntryDependency from 'webpack/lib/dependencies/EntryDependency.js';
import { Config, Mapping, NormalizedMapping } from '@grexie/pages';

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
        this.context.build.rootDir,
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
      entryModule.buildInfo.fileDependencies ?? []
    );
    compilation.buildDependencies.addAll(
      entryModule.buildInfo.buildDependencies ?? []
    );
    compilation.contextDependencies.addAll(
      entryModule.buildInfo.contextDependencies ?? []
    );

    compilation.hooks.processAssets.tapPromise(
      { name: 'SourceCompiler', stage: Infinity },
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
    mapping?: {
      source: Source;
      mapping: NormalizedMapping;
      config: Config;
    },
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
                rootDir: path.resolve(
                  mapping.source.dirname,
                  mapping.mapping.from
                ),
                basePath: mapping.mapping.to,
              }
            : {}),
        },
      ],
      mapping: mapping?.mapping,
      rootDir: mapping
        ? path.resolve(mapping.source.dirname, mapping.mapping.from)
        : this.context.rootDir,
    });

    let sources = [...(this.sources ?? (await thisContext.registry.list()))];

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

          if (seen.has(source.slug)) {
            return;
          }

          if (!config.render) {
            return;
          }

          seen.add(source.slug);

          return { context, source, config };
        })
      )
    ).filter(x => !!x) as {
      context: CompilationContext;
      source: Source;
      config: Config;
    }[];

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
      if (el.config.mappings?.length) {
        for (const mapping of el.config.mappings) {
          mappings.push({ ...el, mapping: normalizeMapping(mapping) });
        }
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
      thisContext.addCompilationRoot(
        path.resolve(mapping.source.dirname, mapping.mapping.from)
      );

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

    compiler.hooks.afterDone.tap('ResourcesPlugin', () => {
      thisContext.dispose();
    });

    return (await Promise.all(promises)).reduce(
      (a, b) => [...a, ...b, ...sourceConfigs],
      []
    );
  }

  apply(compiler: Compiler) {
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

      await Promise.all(
        sourceConfigs.map(async ({ context, source, config }) => {
          const sourceCompiler = new SourceCompiler(context, source, config);
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
