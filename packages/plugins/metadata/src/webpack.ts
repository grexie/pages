import webpack, { Compilation, Compiler } from 'webpack';
import glob from 'glob';
import path from 'path';
import vm, { SourceTextModule } from 'vm';
import NodeModule, { createRequire, builtinModules } from 'module';
import { ResolvablePromise, createResolver } from '@grexie/resolvable';
import { Resource } from '@grexie/pages';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import type { NextConfig } from 'next';
import { setConfig } from 'next/config.js';

type WrappedScript = (
  exports: any,
  require: NodeJS.Require,
  module: NodeModule,
  __filename: string,
  __dirname: string
) => void;

const wrapScript = (code: string): string =>
  `(exports, require, module, __filename, __dirname) => {\n${code}\n}`;

export class Loader {
  compilation: Compilation;
  readonly #dependents: Record<string, Set<string>> = {};
  readonly #modules: Record<
    string,
    Promise<{ webpackModule?: webpack.Module; module: vm.Module }>
  > = {};
  readonly #vmContext = vm.createContext({
    process,
    fetch,
    __DEV__: process.env.NODE_ENV !== 'production',
    $RefreshReg$: () => {},
    $RefreshSig$: () => () => {},
  });

  constructor(compilation: Compilation) {
    this.compilation = compilation;
  }

  async #createSyntheticModule(exports: any) {
    const keys: string[] = [];
    if (typeof exports === 'function') {
      keys.push('default');
    } else if (exports.__esModule) {
      keys.push(...Object.keys(exports));
      if (!keys.includes('default')) {
        keys.push('default');
      }
    } else {
      keys.push(...Object.keys(exports));
      if (!keys.includes('default')) {
        keys.push('default');
      }
    }

    const vmModule = new vm.SyntheticModule(
      keys,
      function (this: any) {
        if (typeof exports === 'function') {
          this.setExport('default', exports);
        } else if (exports.__esModule) {
          for (const key of keys) {
            if (key === 'default') {
              this.setExport(key, exports.default ?? exports);
            }
            this.setExport(key, exports[key]);
          }
        } else {
          for (const key of keys) {
            if (key === 'default') {
              this.setExport(key, exports);
            }
            this.setExport(key, exports[key]);
          }
        }
      },
      {
        context: this.#vmContext,
      }
    );

    await vmModule.link((() => {}) as any);
    await vmModule.evaluate();

    return vmModule;
  }

  async #nodeLoader(specifier: string) {
    console.info(specifier);
    const exports = await import(specifier);

    return this.#createSyntheticModule(exports);
  }

  async #cjsLoader(context: string, filename: string, source: string) {
    const script = new vm.Script(wrapScript(source), {
      filename,
    }).runInContext(this.#vmContext) as WrappedScript;

    const scriptModule = new NodeModule(filename);
    scriptModule.require = createRequire(filename);

    script(
      scriptModule.exports,
      scriptModule.require,
      scriptModule,
      filename,
      path.dirname(filename)
    );

    const exports = scriptModule.exports;

    return this.#createSyntheticModule(exports);
  }

  evict(...files: string[]): string[] {
    const deleteDependents = (file: string) => {
      for (const dependent of this.#dependents[file] ?? new Set()) {
        delete this.#modules[dependent];
        files.push(dependent);
        deleteDependents(dependent);
      }
      delete this.#dependents[file];
    };
    for (const file of files ?? []) {
      delete this.#modules[file];
      deleteDependents(file);
    }
    return [...new Set(files)];
  }

  async executeModule(
    filename: string,
    source: string,
    issuerLayer: string
  ): Promise<{ module: vm.Module }> {
    const context = path.dirname(filename);

    const module = new SourceTextModule(source, {
      identifier: filename,
      context: this.#vmContext,
      initializeImportMeta(meta, module) {
        meta.url = filename;
      },
      importModuleDynamically: (async (
        specifier: string
      ): Promise<vm.Module> => {
        return (
          await this.importModule(context, specifier, filename, issuerLayer)
        ).module;
      }) as any,
    });

    await module.link(async (specifier, referencingModule, extra) => {
      return (
        await this.importModule(context, specifier, filename, issuerLayer)
      ).module;
    });
    await module.evaluate();

    return { module };
  }

  async importModule(
    context: string,
    specifier: string,
    parent?: string,
    issuerLayer?: string
  ): Promise<{
    webpackModule?: webpack.Module;
    module: vm.Module;
  }> {
    if (
      builtinModules.includes(specifier) ||
      /^next\/config(\.js)?$)/.test(specifier)
    ) {
      if (!this.#modules[specifier]) {
        this.#modules[specifier] = Promise.resolve({
          module: await this.#nodeLoader(specifier),
        });
      }
      return this.#modules[specifier];
    }

    var result: string, resolveContext: any;

    const normalResolver =
      this.compilation.compiler.resolverFactory.get('normal');

    var { result, resolveContext }: { result: string; resolveContext: any } =
      await new Promise((resolve, reject) => {
        try {
          normalResolver.resolve(
            {},
            context,
            specifier.replace(/\?.*$/, ''),
            {},
            (err: Error | null, result?: any, resolveContext?: any) => {
              if (err) {
                reject(err);
                return;
              }

              resolve({ result, resolveContext });
            }
          );
        } catch (err) {
          reject(err);
        }
      });

    if (parent) {
      this.#dependents[result] = this.#dependents[result] ?? new Set();
      this.#dependents[result].add(parent);
    }

    if (typeof this.#modules[result] !== 'undefined') {
      return this.#modules[result];
    }

    const resolver = createResolver<{
      webpackModule?: webpack.Module;
      module: vm.Module;
    }>();
    this.#modules[result] = resolver;

    try {
      const dependency = new webpack.dependencies.ModuleDependency(result);

      const webpackModule = await new Promise<webpack.Module>(
        (resolve, reject) =>
          this.compilation.params.normalModuleFactory.create(
            {
              context,
              contextInfo: {
                issuer: parent!,
                issuerLayer,
                compiler: 'javascript/auto',
              },
              dependencies: [dependency],
            },
            (err, result) => {
              if (err) {
                reject(err);
                return;
              }

              resolve(result!.module!);
            }
          )
      );

      await new Promise<void>((resolve, reject) => {
        try {
          this.compilation.buildQueue.add(webpackModule, err => {
            if (err) {
              reject(err);
              return;
            }

            resolve();
          });
        } catch (err) {
          reject(err);
        }
      });

      if ([...(webpackModule.getErrors() ?? [])].length) {
        throw [...(webpackModule.getErrors() ?? [])];
      }

      const source = webpackModule.originalSource()!.buffer().toString();

      if (
        !/\.(esm\.js|es\.js|mjs)$/.test(result) &&
        !/^\s*import[{\s]|^\s*export[{\s]/m.test(source) &&
        (resolveContext.descriptionFileData.type !== 'module' ||
          /\.cjs$/.test(result))
      ) {
        resolver.resolve({
          webpackModule,
          module: await this.#cjsLoader(context, result, source),
        });
        return await resolver;
      }

      const module = new SourceTextModule(source, {
        identifier: result,
        context: this.#vmContext,
        initializeImportMeta(meta, module) {
          meta.url = result;
        },
        importModuleDynamically: (async (
          specifier: string
        ): Promise<vm.Module> => {
          return (
            await this.importModule(
              path.dirname(result),
              specifier,
              result,
              issuerLayer
            )
          ).module;
        }) as any,
      });

      await module.link(async (specifier, referencingModule, extra) => {
        return (
          await this.importModule(
            path.dirname(result),
            specifier,
            result,
            issuerLayer
          )
        ).module;
      });
      await module.evaluate();

      resolver.resolve({ webpackModule, module });
    } catch (err) {
      resolver.reject(err);
    } finally {
      return resolver;
    }
  }
}

export interface WebpackPagesPluginOptions {
  pagesDir: string;
  config: NextConfig;
}

export class WebpackPagesPlugin {
  readonly pagesDir: string;
  resources?: Record<string, Resource>;
  ready?: ResolvablePromise<void>;

  #loader?: Loader;
  readonly #config: NextConfig;

  constructor({ pagesDir, config }: WebpackPagesPluginOptions) {
    this.pagesDir = pagesDir;
    this.#config = config;
  }

  createLoader(compilation: Compilation) {
    // return new Loader(compilation, false);
    if (!this.#loader) {
      this.#loader = new Loader(compilation);
    }
    this.#loader.compilation = compilation;
    return this.#loader;
  }

  apply(compiler: Compiler) {
    compiler.hooks.make.tapPromise(
      { name: 'PagesPlugin', stage: -Infinity },
      async compilation => {
        this.ready = createResolver();

        if (
          !this.resources &&
          existsSync(path.resolve('.next', 'cache', 'pages-resources.json'))
        ) {
          this.resources = JSON.parse(
            (
              await fs.readFile(
                path.resolve('.next', 'cache', 'pages-resources.json')
              )
            ).toString()
          );
        }

        setConfig({
          publicRuntimeConfig: this.#config.publicRuntimeConfig,
          serverRuntimeConfig: this.#config.serverRuntimeConfig,
        });

        const loader = this.createLoader(compilation);

        let modifiedFiles = compiler.modifiedFiles
          ? new Set<string>([...(compiler.modifiedFiles?.values() ?? [])])
          : null;

        if (modifiedFiles) {
          modifiedFiles = new Set(loader.evict(...(modifiedFiles ?? [])));
        }

        const files = glob.sync('**/*.{js,jsx,mjs,cjs,ts,tsx,md,mdx}', {
          cwd: 'pages',
          nodir: true,
          ignore: ['_app.tsx', '_document.tsx', 'api/**', '**/*.d.ts'],
        });

        files.forEach(file => {
          if (this.resources) {
            if (!(file in this.resources)) {
              delete this.resources[file];
            }
          }

          compilation.fileDependencies.add(path.resolve('pages', file));
        });

        try {
          await new Promise<void>((resolve, reject) =>
            compilation
              .createChildCompiler('PagesPlugin', {}, [
                {
                  apply: compiler => {
                    compiler.hooks.make.tapPromise(
                      { name: 'PagesPlugin' },
                      async compilation => {
                        files.forEach(file =>
                          compilation.fileDependencies.add(
                            path.resolve('pages', file)
                          )
                        );

                        compilation.dependencyFactories.set(
                          webpack.dependencies.ModuleDependency,
                          compilation.params.normalModuleFactory
                        );

                        this.resources = {
                          ...(this.resources ?? {}),
                          ...(
                            await Promise.all(
                              files
                                .filter(file => {
                                  return (
                                    modifiedFiles?.has(
                                      path.resolve('pages', file)
                                    ) ?? true
                                  );
                                })
                                .map(file =>
                                  loader
                                    .importModule(
                                      process.cwd(),
                                      path.resolve('pages', file),
                                      undefined,
                                      'pages'
                                    )
                                    .then(({ webpackModule, module }) => {
                                      return {
                                        [path.resolve('pages', file)]: (
                                          module.namespace as any
                                        ).resource,
                                      };
                                    })
                                )
                            )
                          ).reduce((a, b) => ({ ...a, ...b }), {}),
                        };

                        await fs.mkdir(path.resolve('.next', 'cache'), {
                          recursive: true,
                        });
                        await fs.writeFile(
                          path.resolve(
                            '.next',
                            'cache',
                            'pages-resources.json'
                          ),
                          JSON.stringify(this.resources, null, 2)
                        );
                      }
                    );
                  },
                },
              ])
              .runAsChild(err => {
                if (err) {
                  reject(err);
                  return;
                }

                resolve();
              })
          ).finally(this.ready!.resolve);

          if (modifiedFiles?.size) {
            compiler.watching.invalidate();
          }
        } catch (err) {
          throw err;
        }
      }
    );
  }
}
