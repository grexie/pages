import { Source } from '../api';
import { BuildContext } from '../builder';
import { Compiler, Compilation, sources as WebpackSources } from 'webpack';
import path from 'path';
import { WritableBuffer } from '../utils/stream';
import { ResourceContext } from '../hooks';
import { createResolver, ResolvablePromise } from '../utils/resolvable';
import { promisify } from '../utils/promisify';

const { RawSource } = WebpackSources;

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

    const handlerModule = await this.context.modules.require(
      factory,
      path.dirname(this.source.filename),
      this.source.filename
    );

    const { exports } = handlerModule.load(module);

    const resourceContext = new ResourceContext();

    const buffer = await this.context.renderer.render(
      new WritableBuffer(),
      resourceContext,
      exports.resource,
      exports.default
    );

    compilation.fileDependencies.add(this.source.filename);

    handlerModule.dependencies.forEach(filename =>
      compilation.fileDependencies.add(filename)
    );

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
          console.info(this.source.filename, meta.dependencies);
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
        resolver.reject(err);
      }

      compilation.hooks.processAssets.tapPromise('SourceCompiler', async () => {
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

export class ResourcesPlugin {
  readonly context: BuildContext;

  constructor({ context }: ResourcesPluginOptions) {
    this.context = context;
  }

  async apply(compiler: Compiler) {
    let sources = await this.context.registry.list();

    compiler.hooks.make.tapPromise('ResourcesPlugin', async compilation => {
      const context = new CompilationContext({
        build: this.context,
        compilation,
      });

      await Promise.all(
        sources.map(async source => {
          const child = compilation.createChildCompiler(
            'SourceCompiler',
            {
              clean: true,
            },
            [new SourceCompiler(context, source)]
          );
          context.compilers[source.filename] = child;
          await new Promise<void>((resolve, reject) =>
            child.runAsChild(err => {
              if (err) {
                reject(err);
                return;
              }

              resolve();
            })
          );
        })
      );
    });
  }
}
