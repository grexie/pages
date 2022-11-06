import { Source } from '../../api/index.js';
import { BuildContext } from '../BuildContext.js';
import webpack from 'webpack';
import { Compiler, Compilation } from 'webpack';
import path from 'path';
import { ResourceContext } from '../../hooks/index.js';
import { WritableBuffer } from '../../utils/stream.js';
import { createResolver } from '../../utils/resolvable.js';
import { promisify } from '../../utils/promisify.js';
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

  async makeHook(name: string, compiler: Compiler, compilation: Compilation) {
    let changed = false;

    const resolver = createResolver();

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
          meta.dependencies.map(dependency => this.context.promises[dependency])
        );
      }

      const entryModule = await new Promise<webpack.Module>((resolve, reject) =>
        compilation.addEntry(
          compiler.context,
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

      if (changed) {
        await new Promise((resolve, reject) => {
          try {
            compilation.rebuildModule(entryModule, (err, result) => {
              if (err) {
                reject(err);
                return;
              }

              resolve(result);
            });
          } catch (err) {
            reject(err);
          }
        });
      }

      resolver.resolve();
    } catch (err) {
      console.error(err);
      resolver.reject(err);
      throw err;
    }

    compilation.hooks.processAssets.tapPromise(
      { name, stage: Infinity },
      async () => {
        if (changed) {
          const files: string[] = [];

          let publicPath = compilation.outputOptions.publicPath ?? '/';
          if (publicPath === 'auto') {
            publicPath = '/';
          }

          const entrypoints = [this.source.slug];

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

                files.push(`${publicPath}${file}`);
              });
            });
          });

          const buffer = await this.render(compilation, files);

          compilation.emitAsset(
            path.join(this.source.slug, 'index.html'),
            new RawSource(buffer!)
          );
        }
      }
    );
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

  async makeHook(name: string, compiler: Compiler, compilation: Compilation) {
    const resolver = createResolver();

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
          meta.dependencies.map(dependency => this.context.promises[dependency])
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
    _dependencies: Set<string>
  ) {
    const resolver = createResolver();
    const process = async () => {
      const dependencies = [..._dependencies];
      _dependencies.clear();

      await Promise.all(
        dependencies.map(async dependency => {
          const child = new AssetCompiler(context, dependency);

          await (context.promises[dependency] = child.makeHook(
            'ResourcesPlugin',
            compiler,
            compilation
          ));
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
      compilation.dependencyFactories.set(
        EntryDependency,
        compilation.params.normalModuleFactory
      );

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
          dependenciesToProcess
        );

      let sourceCount = sources.length;

      await Promise.all([
        dependencyResolver,
        ...sources.map(async source => {
          const child = new SourceCompiler(context, source);

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

          await child.makeHook('ResourcesPlugin', compiler, compilation);
        }),
      ]);
    });
  }
}
