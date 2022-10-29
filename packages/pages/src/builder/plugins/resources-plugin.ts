import { Source } from '../../api';
import { BuildContext } from '../BuildContext';
import webpack, { Compiler, Compilation } from 'webpack';
import path from 'path';
import { ResourceContext } from '../../hooks';
import { WritableBuffer } from '../../utils/stream';
import { createResolver } from '../../utils/resolvable';
import { promisify } from '../../utils/promisify';

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

class SourceCompiler {
  readonly context: CompilationContext;
  readonly source: Source;

  constructor(context: CompilationContext, source: Source) {
    this.context = context;
    this.source = source;
  }

  async render(compilation: Compilation) {
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

    const buffer = await this.context.renderer.render(
      new WritableBuffer(),
      resourceContext,
      exports.resource,
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

      this.context.promises[this.source.filename] = resolver;
      let buffer: Buffer | undefined;
      try {
        compilation.fileDependencies.add(this.source.filename);

        const changed = await this.hasChanged(
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

        if (changed) {
          buffer = await this.render(compilation);
        }

        resolver.resolve();
      } catch (err) {
        console.error(err);
        resolver.reject(err);
        throw err;
      }

      compilation.hooks.processAssets.tap('SourceCompiler', () => {
        if (buffer) {
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

      await Promise.all([
        dependencyResolver,
        ...sources.map(async source => {
          const child = compilation.createChildCompiler(
            'SourceCompiler',
            {
              clean: false,
            },
            [new SourceCompiler(context, source)]
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
