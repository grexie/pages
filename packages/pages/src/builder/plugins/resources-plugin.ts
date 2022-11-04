import { Source } from '../../api/index.js';
import { BuildContext } from '../BuildContext.js';
import { default as webpack } from 'webpack';
import { Compiler, Compilation } from 'webpack';
import path, { resolve } from 'path';
import { ResourceContext } from '../../hooks/index.js';
import { WritableBuffer } from '../../utils/stream.js';
import { createResolver, ResolvablePromise } from '../../utils/resolvable.js';
import { promisify } from '../../utils/promisify.js';
import EntryDependency from 'webpack/lib/dependencies/EntryDependency.js';
import { rejects } from 'assert';

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
    return this.build.modules;
  }

  get renderer() {
    return this.build.renderer;
  }
}

class EntryCompiler {
  readonly context: CompilationContext;
  readonly sources: Source[];
  readonly resolver: ResolvablePromise<Record<string, webpack.Chunk>>;

  constructor(
    context: CompilationContext,
    sources: Source[],
    resolver: ResolvablePromise<Record<string, webpack.Chunk>>
  ) {
    this.context = context;
    this.sources = sources;
    this.resolver = resolver;
  }

  apply(compiler: Compiler) {
    compiler.hooks.make.tapPromise('EntryCompiler', async compilation => {
      compilation.dependencyFactories.set(
        EntryDependency,
        compilation.params.normalModuleFactory
      );

      const entryModules = (
        await Promise.all(
          this.sources.map(async source => {
            const dependency = new EntryDependency(source.filename);
            dependency.loc = { name: source.slug };
            const entryModule = await new Promise<webpack.Module>(
              (resolve, reject) =>
                compilation.addEntry(
                  this.context.build.rootDir,
                  dependency,
                  {
                    name: source.slug,
                    filename: `${source.slug}${source.slug ? '/' : ''}index.js`,
                  },
                  (err, entryModule) => {
                    if (err) {
                      reject(err);
                      return;
                    }

                    resolve(entryModule!);
                  }
                )
            );

            return [source, entryModule] as [Source, webpack.Module];
          })
        )
      ).reduce(
        (a, [source, entryModule]) => ({
          ...a,
          [source.slug]: entryModule,
        }),
        {}
      );

      console.info('here4');
      compilation.hooks.processAssets.tap('ResourcesPlugin', () => {
        const entryChunks = {} as Record<string, webpack.Chunk>;

        compilation.chunks.forEach(chunk => {
          if (chunk.id !== null && chunk.id in entryModules) {
            entryChunks[chunk.id] = chunk;
          }
        });

        console.info('here2');
        this.resolver.resolve(entryChunks);
      });
    });
  }
}

class SourceCompiler {
  readonly context: CompilationContext;
  readonly source: Source;
  readonly chunks: Promise<Record<string, webpack.Chunk>>;

  constructor(
    context: CompilationContext,
    source: Source,
    chunks: Promise<Record<string, webpack.Chunk>>
  ) {
    this.context = context;
    this.source = source;
    this.chunks = chunks;
  }

  async render(compilation: Compilation, scripts: string[]) {
    const factory = this.context.modules.createModuleFactory(compilation);

    if (process.env.PAGES_DEBUG_LOADERS === 'true') {
      console.info('render', this.source.filename);
    }
    const handlerModule = await this.context.modules.require(
      factory,
      path.dirname(this.source.filename),
      this.source.filename
    );
    if (process.env.PAGES_DEBUG_LOADERS === 'true') {
      console.info('render:handler', this.source.filename);
    }

    await handlerModule.load();
    const { exports } = handlerModule;

    const resourceContext = new ResourceContext();

    if (process.env.PAGES_DEBUG_LOADERS === 'true') {
      console.info('render:rendering', this.source.filename);
    }

    console.info('rendering', this.source.filename, scripts);

    const buffer = await this.context.renderer.render(
      new WritableBuffer(),
      resourceContext,
      exports.resource,
      scripts,
      exports.default
    );

    if (process.env.PAGES_DEBUG_LOADERS === 'true') {
      console.info('render:rendered', this.source.filename);
    }

    compilation.fileDependencies.add(this.source.filename);

    handlerModule.dependencies.forEach(filename =>
      compilation.fileDependencies.add(filename)
    );

    await handlerModule.persist();

    return buffer;
  }

  async hasChanged(
    compiler: Compiler,
    filename: string,
    seen: Record<string, boolean> = {},
    defaultForNoMeta: boolean = true
  ): Promise<boolean> {
    if (seen[filename]) {
      return false;
    }

    seen[filename] = true;

    const meta = await this.context.modules.meta(filename);
    if (!meta) {
      return defaultForNoMeta;
    }

    const stat = promisify(
      compiler.inputFileSystem,
      compiler.inputFileSystem.stat
    );
    try {
      const stats = await stat(filename);
      if (stats.mtimeMs > meta.mtime) {
        return true;
      }
    } catch (err) {
      return false;
    }

    const results = await Promise.all(
      meta.dependencies.map(dependency =>
        this.hasChanged(compiler, dependency, seen, false)
      )
    );
    return results.reduce((a, b) => a || b, false);
  }

  apply(compiler: Compiler) {
    compiler.hooks.make.tapPromise('SourceCompiler', async compilation => {
      const resolver = createResolver();
      let changed = false;

      this.context.promises[this.source.filename] = resolver;
      try {
        compilation.fileDependencies.add(this.source.filename);

        changed = await this.hasChanged(
          compilation.compiler,
          this.source.filename
        );

        const meta = await this.context.modules.meta(this.source.filename);
        if (meta) {
          meta.dependencies.forEach(dependency =>
            compilation.fileDependencies.add(dependency)
          );

          await Promise.all(
            meta.dependencies.map(
              dependency => this.context.promises[dependency]
            )
          );
        }

        resolver.resolve();
      } catch (err) {
        console.error(err);
        resolver.reject(err);
        throw err;
      }

      compilation.hooks.processAssets.tapPromise('SourceCompiler', async () => {
        if (changed) {
          const files = new Set<string>();
          console.info('here2', this.source.filename);
          const chunk = (await this.chunks)[this.source.slug];

          console.info('here', this.source.filename);

          chunk?.files.forEach((a, b, c) => {
            files.add(a);
          });

          for (const group of chunk?.groupsIterable ?? []) {
            for (const file of group.getFiles()) {
              files.add(file);
            }
          }

          const buffer = await this.render(compilation, [...files]);

          compilation.emitAsset(
            path.join(this.source.slug, 'index.html'),
            new RawSource(buffer!)
          );
        }
      });
    });
  }
}

class AssetCompiler {
  readonly context: CompilationContext;
  readonly resourcePath: string;

  constructor(context: CompilationContext, resourcePath: string) {
    this.context = context;
    this.resourcePath = resourcePath;
  }

  async hasChanged(
    compiler: Compiler,
    filename: string,
    seen: Record<string, boolean> = {},
    defaultForNoMeta: boolean = true
  ): Promise<boolean> {
    if (seen[filename]) {
      return false;
    }

    seen[filename] = true;

    const meta = await this.context.modules.meta(filename);
    if (!meta) {
      return defaultForNoMeta;
    }

    const stat = promisify(
      compiler.inputFileSystem,
      compiler.inputFileSystem.stat
    );
    try {
      const stats = await stat(filename);
      if (stats.mtimeMs > meta.mtime) {
        return true;
      }
    } catch (err) {
      return false;
    }

    const results = await Promise.all(
      meta.dependencies.map(dependency =>
        this.hasChanged(compiler, dependency, seen, false)
      )
    );
    return results.reduce((a, b) => a || b, false);
  }

  apply(compiler: Compiler) {
    compiler.hooks.make.tapPromise('AssetCompiler', async compilation => {
      const resolver = createResolver();
      await this.context.build.modules.addBuild(this.resourcePath, resolver);

      this.context.promises[this.resourcePath] = resolver;
      let buffer: Buffer | undefined;
      try {
        compilation.fileDependencies.add(this.resourcePath);

        const changed = await this.hasChanged(
          compilation.compiler,
          this.resourcePath
        );

        const meta = await this.context.modules.meta(this.resourcePath);
        if (meta) {
          meta.dependencies.forEach(dependency =>
            compilation.fileDependencies.add(dependency)
          );

          await Promise.all(
            meta.dependencies.map(
              dependency => this.context.promises[dependency]
            )
          );
        }

        if (changed) {
          const factory = this.context.modules.createModuleFactory(compilation);
          await this.context.build.modules.evict(factory, this.resourcePath, {
            fail: false,
          });
        }

        resolver.resolve();
      } catch (err) {
        resolver.reject(err);
        throw err;
      }
    });
  }
}

export class ResourcesPlugin {
  readonly context: BuildContext;

  constructor({ context }: ResourcesPluginOptions) {
    this.context = context;
  }

  processDependencies(
    context: CompilationContext,
    compiler: Compiler,
    compilation: Compilation,
    sources: Source[],
    seen: Set<string>,
    _dependencies: Set<string>
  ) {
    const resolver = createResolver();
    const process = async () => {
      const dependencies = [..._dependencies];
      _dependencies.clear();

      await Promise.all(
        dependencies.map(async dependency => {
          const child = compilation.createChildCompiler(
            'AssetCompiler',
            {
              clean: false,
            },
            [new AssetCompiler(context, dependency)]
          );

          const promise = (context.promises[dependency] = new Promise<void>(
            (resolve, reject) =>
              child.runAsChild(err => {
                if (err) {
                  reject(err);
                  return;
                }

                resolve();
              })
          ));

          await promise;
        })
      );
    };

    return { resolver, process };
  }

  getEntries(compilation: Compilation) {
    return [...compilation.entrypoints].map(([name, entrypoint]) => ({
      [name]: entrypoint.chunks,
    }));
  }

  apply(compiler: Compiler) {
    compiler.hooks.make.tapPromise('ResourcesPlugin', async compilation => {
      let sources = await this.context.registry.list();

      const context = new CompilationContext({
        build: this.context,
        compilation,
      });

      const seen = new Set<string>([...sources].map(source => source.filename));
      const dependenciesToProcess = new Set<string>();
      const { resolver: dependencyResolver, process: processDependencies } =
        this.processDependencies(
          context,
          compiler,
          compilation,
          sources,
          seen,
          dependenciesToProcess
        );

      let sourceCount = sources.length;

      const chunksResolver = createResolver<Record<string, webpack.Chunk>>();

      await Promise.all([
        dependencyResolver,
        new Promise<void>((resolve, reject) =>
          compilation
            .createChildCompiler('EntryCompiler', { clean: false }, [
              new EntryCompiler(context, sources, chunksResolver),
            ])
            .runAsChild(err => {
              if (err) {
                reject(err);
                return;
              }

              resolve();
            })
        ),
        ...sources.map(async source => {
          const child = compilation.createChildCompiler(
            'SourceCompiler',
            {
              clean: false,
            },
            [new SourceCompiler(context, source, chunksResolver)]
          );
          context.compilers[source.filename] = child;

          const meta = await this.context.modules.meta(source.filename);
          meta?.dependencies.forEach(dependency => {
            if (!seen.has(dependency)) {
              seen.add(dependency);
              dependenciesToProcess.add(dependency);
            }
          });
          processDependencies();
          if (--sourceCount === 0) {
            dependencyResolver.resolve();
          }

          await dependencyResolver;

          await new Promise<void>((resolve, reject) =>
            child.runAsChild(err => {
              if (err) {
                reject(err);
                return;
              }

              resolve();
            })
          );
        }),
      ]);
    });
  }
}
