import { EventManager, Events } from './EventManager.js';
import type { ReadableFileSystem } from './FileSystem.js';
import type { BuildContext } from './BuildContext.js';
import resolve from 'enhanced-resolve';
import path from 'path';
import { createRequire } from 'module';

export interface DescriptionFile {
  name?: string;
  exports?: Record<string, string | Record<string, string>>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

export type PluginHandler = (
  context: Events<BuildContext>
) => Promise<void> | void;

export interface Plugin {
  name: string;
  path: string;
  handler: PluginHandler;
}

export class PluginContext {
  readonly #plugins = new Map<string, Promise<Plugin>>();
  readonly plugins = new Set<Plugin>();
  readonly #fs: ReadableFileSystem;

  private constructor(fs: ReadableFileSystem, descriptionFile: string) {
    this.#fs = fs;
    this.createPlugins(descriptionFile);
  }

  static async create(fs: ReadableFileSystem, descriptionFile: string) {
    const context = new PluginContext(fs, descriptionFile);

    const plugins = await Promise.all(context.#plugins.values());
    for (const plugin of plugins) {
      context.plugins.add(plugin);
    }

    return context;
  }

  protected createPluginResolver(resolveToContext: boolean) {
    const require = createRequire(import.meta.url);

    const pagesDir = path.dirname(
      require.resolve('@grexie/pages/package.json')
    );
    const pagesModules: string[] = [];

    let dirname = pagesDir;
    while (dirname) {
      pagesModules.push(path.resolve(dirname, 'node_modules'));
      if (path.dirname(dirname) === dirname) {
        break;
      }
      dirname = path.dirname(dirname);
    }
    const modulesDirs = [...pagesModules];

    return resolve.ResolverFactory.createResolver({
      modules: modulesDirs,
      fileSystem: this.#fs as any,
      conditionNames: ['@grexie/pages'],
      resolveToContext,
      useSyncFileSystemCalls: true,
    });
  }

  protected createPlugin(context: string, request: string) {
    if (this.#plugins.has(request)) {
      return;
    }

    let resolved: string | false = false;
    try {
      const resolver = this.createPluginResolver(false);
      resolver.hooks.result.tap('describe', (request, context) => {
        resolved = request.descriptionFileRoot ?? false;
      });
      resolver.resolveSync({}, context, request);

      if (!resolved) {
        return;
      }

      const descriptionFileData: DescriptionFile = JSON.parse(
        this.#fs.readFileSync(path.resolve(resolved, 'package.json')).toString()
      );
      const exports = descriptionFileData.exports?.['.'];

      if (typeof exports !== 'object') {
        return;
      }

      if (!exports['@grexie/pages'] as any) {
        return;
      }
    } catch (err) {
      return;
    }

    try {
      const entrypoint = this.createPluginResolver(false).resolveSync(
        {},
        context,
        request
      );

      if (!entrypoint) {
        return;
      }

      const plugin: Promise<Plugin> = import(entrypoint).then(
        (exports): Plugin => ({
          name: request,
          path: resolved as string,
          handler: exports.default,
        })
      );
      this.#plugins.set(request, plugin);
      this.createPlugins(path.resolve(resolved, 'package.json'));
    } catch (err) {
      console.error(err);
    }
  }

  protected createPlugins(descriptionFile: string) {
    try {
      const stat = this.#fs.statSync(descriptionFile);
    } catch (err) {
      return;
    }

    const descriptionFileData: DescriptionFile = JSON.parse(
      this.#fs.readFileSync(descriptionFile).toString()
    );

    for (const request in descriptionFileData.dependencies ?? {}) {
      this.createPlugin(path.dirname(descriptionFile), request);
    }

    for (const request in descriptionFileData.devDependencies ?? {}) {
      this.createPlugin(path.dirname(descriptionFile), request);
    }

    for (const request in descriptionFileData.peerDependencies ?? {}) {
      this.createPlugin(path.dirname(descriptionFile), request);
    }

    for (const request in descriptionFileData.optionalDependencies ?? {}) {
      this.createPlugin(path.dirname(descriptionFile), request);
    }
  }
}
