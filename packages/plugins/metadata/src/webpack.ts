import webpack, { Compilation, Compiler } from 'webpack';
import glob from 'glob';
import path, { isAbsolute } from 'path';
import vm, { SourceTextModule } from 'vm';
import NodeModule, { createRequire, builtinModules } from 'module';
import { ResolvablePromise, createResolver } from '@grexie/resolvable';
import { Metadata, Resource } from '@grexie/pages';
import fs from 'fs/promises';
import { createReadStream } from 'fs';
import { existsSync } from 'fs';
import type { NextConfig } from 'next';
import { setConfig } from 'next/config.js';
import * as mdx from '@mdx-js/mdx';
import remarkFrontmatter from 'remark-frontmatter';
import { matter } from 'vfile-matter';
import { remarkExcerpt } from './remark.js';
import { wrapMetadata } from '@grexie/pages-runtime-metadata';
import cliProgress from 'cli-progress';

const MAX_FRONTMATTER_WORKERS = 30;

type WrappedScript = (
  exports: any,
  require: NodeJS.Require,
  module: NodeModule,
  __filename: string,
  __dirname: string
) => void;

const wrapScript = (code: string): string =>
  `(exports, require, module, __filename, __dirname) => {\n${code}\n}`;

const extensions = [
  'yml',
  'yaml',
  'json',
  'js',
  'jsx',
  'cjs',
  'cjsx',
  'mjs',
  'mjsx',
  'ts',
  'tsx',
  'cts',
  'ctsx',
  'mts',
  'mtsx',
];

export class Loader {
  compilation: Compilation;
  readonly #dependents: Record<
    string,
    { mtimeMs: number; dependents: string[] }
  > = {};
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

  async persist() {
    await fs.writeFile(
      path.resolve('.next', 'cache', 'pages-dependents.json'),
      JSON.stringify(this.#dependents, null, 2)
    );
  }

  async load() {
    if (!existsSync(path.resolve('.next', 'cache', 'pages-dependents.json'))) {
      return 0;
    }

    Object.assign(
      this.#dependents,
      JSON.parse(
        (
          await fs.readFile(
            path.resolve('.next', 'cache', 'pages-dependents.json')
          )
        ).toString()
      )
    );

    return Object.keys(this.#dependents).length;
  }

  async modified(): Promise<Set<string>> {
    const modified = new Set<string>();

    const addDependent = (dependent: string) => {
      modified.add(dependent);
      const { dependents } = this.#dependents[dependent] ?? { dependents: [] };
      for (const dependent of dependents) {
        addDependent(dependent);
      }
    };

    for (const record in this.#dependents) {
      if (!path.isAbsolute(record)) {
        continue;
      }

      try {
        const { mtimeMs } = await fs.stat(record);
        if (mtimeMs !== this.#dependents[record].mtimeMs) {
          addDependent(record);
        }
      } catch (err) {
        addDependent(record);
      }
    }

    return modified;
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
      for (const dependent of this.#dependents[file]?.dependents ?? []) {
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
      /^next\/config(\.js)?$/.test(specifier)
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
      this.#dependents[result] = this.#dependents[result] ?? { dependents: [] };
      if (!this.#dependents[result].dependents.includes(result)) {
        this.#dependents[result].dependents.push(parent);
      }
    }

    if (typeof this.#modules[result] !== 'undefined') {
      return this.#modules[result];
    }

    const resolver = createResolver<{
      webpackModule?: webpack.Module;
      module: vm.Module;
    }>();
    this.#modules[result] = resolver;

    if (!this.#dependents[result]?.mtimeMs) {
      this.#dependents[result] = this.#dependents[result] ?? { dependents: [] };
      this.#dependents[result].mtimeMs = (await fs.stat(result)).mtimeMs;
    }

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
          this.compilation.buildQueue.increaseParallelism();
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
      this.compilation.buildQueue.decreaseParallelism();

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
  cache: Record<string, any> = {};
  pagesFiles?: string[];

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

  getPagesFiles(sourceFilename: string): string[] {
    const files = this.pagesFiles!;

    return files.filter(filename => {
      const basename = path.basename(filename).replace(/\.pages\.\w+$/i, '');
      const sourceBasename = path
        .basename(sourceFilename!)
        .replace(/\.\w+$/i, '');
      const dirname = path.dirname(filename);

      return (
        (path.dirname(sourceFilename!).substring(0, dirname.length) ===
          dirname &&
          basename === '') ||
        (path.dirname(sourceFilename!) === dirname &&
          basename === sourceBasename)
      );
    });
  }

  readonly #frontmatterWorkers: Promise<void>[] = [];

  async parseFrontmatter(
    loader: Loader,
    file: string,
    pagesDir: string
  ): Promise<{ resource: Resource }> {
    while (this.#frontmatterWorkers.length >= MAX_FRONTMATTER_WORKERS) {
      await Promise.race(this.#frontmatterWorkers);
    }

    const promise = this.parseFrontmatterWorker(loader, file, pagesDir);
    const handle = promise.then(
      () => {},
      () => {}
    );
    handle.finally(() => {
      this.#frontmatterWorkers.splice(
        this.#frontmatterWorkers.indexOf(handle),
        1
      );
    });
    this.#frontmatterWorkers.push(handle);
    return promise;
  }

  async parseFrontmatterWorker(
    loader: Loader,
    file: string,
    pagesDir: string
  ): Promise<{ resource: Resource }> {
    if (process.env.PAGES_DEBUG_TRANSFORM === 'true') {
      console.info(
        '- pages',
        'parsing front matter',
        path.resolve(process.cwd(), file)
      );
    }

    const pagesFiles = await this.getPagesFiles(
      path.resolve(process.cwd(), file)
    );
    let parent: any = {};
    for (const pagesFile of pagesFiles) {
      // if (this.cache[pagesFile]) {
      //   parent = this.cache[pagesFile];
      //   continue;
      // }

      const { module } = await loader.importModule(
        process.cwd(),
        pagesFile,
        undefined,
        'pages'
      );

      parent = wrapMetadata((module.namespace as any).default)(
        { filename: pagesFile },
        parent
      );
      // this.cache[pagesFile] = parent;
    }

    const resourcePath = path
      .relative(pagesDir, file)
      .split(new RegExp(path.sep, 'g'));

    resourcePath[resourcePath.length - 1] = resourcePath[
      resourcePath.length - 1
    ].replace(/\.\w+$/i, '');

    if (resourcePath[resourcePath.length - 1] === 'index') {
      resourcePath.pop();
    }

    const slug = ['', ...resourcePath].join('/');

    const chunks = [];
    for await (let chunk of createReadStream(file)) {
      chunks.push(chunk);
    }

    let vfile = await mdx.compile(
      { value: Buffer.concat(chunks), path: file },
      {
        jsx: true,
        format: 'detect',
        remarkPlugins: [
          remarkFrontmatter,
          () => (tree, file: any) => {
            matter(file);
            return tree;
          },
          remarkExcerpt as any,
        ],
      }
    );

    let metadata = {
      ...(vfile.data.matter as any),
      excerpt: vfile.data.excerpt,
    };

    metadata = wrapMetadata({ path: resourcePath, slug, ...metadata })(
      { filename: path.resolve(process.cwd(), file) },
      parent
    );

    const resource = {
      path: resourcePath,
      slug,
      metadata: metadata as Metadata,
    };

    if (process.env.PAGES_DEBUG_TRANSFORM === 'true') {
      console.info(
        '- pages',
        'parsed front matter',
        path.resolve(process.cwd(), file)
      );
    }

    return { resource };
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
        const dependents = await loader.load();

        let modifiedFiles = compiler.modifiedFiles
          ? new Set<string>([...(compiler.modifiedFiles?.values() ?? [])])
          : dependents > 0
          ? await loader.modified()
          : null;

        if (modifiedFiles) {
          modifiedFiles = new Set(loader.evict(...(modifiedFiles ?? [])));
        }

        for (const f of [...(modifiedFiles ?? [])]) {
          delete this.cache[f];
        }
        this.pagesFiles = await new Promise<string[]>((resolve, reject) =>
          glob(
            '**/*.pages.{' + extensions.join(',') + '}',
            {
              cwd: process.cwd(),
              ignore: ['**/node_modules/**', '**/.next/**'],
              nodir: true,
              dot: true,
            },
            (err, files) => {
              if (err) {
                reject(err);
                return;
              }

              resolve(files);
            }
          )
        ).then(files => files.map(file => path.resolve(process.cwd(), file)));

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

                        const filesToProcess = files.filter(file => {
                          return (
                            modifiedFiles?.has(path.resolve('pages', file)) ??
                            true
                          );
                        });

                        if (filesToProcess.length === 0) {
                          return;
                        }

                        const progress = new cliProgress.SingleBar(
                          {
                            clearOnComplete: true,
                            hideCursor: true,
                            noTTYOutput: true,
                            notTTYSchedule: 500,
                            format: '  {bar} | {percentage}% {eta_formatted}',
                          },
                          cliProgress.Presets.shades_grey
                        );

                        console.info(
                          '- pages',
                          'evaluating resources for',
                          filesToProcess.length,
                          'files'
                        );

                        let filesCompleted = 0;
                        progress.start(filesToProcess.length, 0);

                        this.resources = {
                          ...(this.resources ?? {}),
                          ...(
                            await Promise.all(
                              filesToProcess
                                .filter(file => /\.mdx?$/.test(file))
                                .map(file =>
                                  this.parseFrontmatter(
                                    loader,
                                    path.resolve('pages', file),
                                    'pages'
                                  )
                                    .then(
                                      ({ resource }) => {
                                        return {
                                          [path.resolve('pages', file)]:
                                            resource,
                                        };
                                      },
                                      err => console.error(err)
                                    )
                                    .finally(() => {
                                      filesCompleted++;
                                      progress.update(filesCompleted);
                                    })
                                )
                            )
                          ).reduce((a, b) => ({ ...a, ...b }), {}),
                          ...(
                            await Promise.all(
                              filesToProcess
                                .filter(file => !/\.mdx?$/.test(file))
                                .map(file =>
                                  loader
                                    .importModule(
                                      process.cwd(),
                                      path.resolve('pages', file),
                                      undefined,
                                      'pages'
                                    )
                                    .then(
                                      ({ webpackModule, module }) => {
                                        return {
                                          [path.resolve('pages', file)]: (
                                            module.namespace as any
                                          ).resource,
                                        };
                                      },
                                      err => console.error(err)
                                    )
                                    .finally(() => {
                                      filesCompleted++;
                                      progress.update(filesCompleted);
                                    })
                                )
                            )
                          ).reduce((a, b) => ({ ...a, ...b }), {}),
                        };

                        progress.stop();

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
                        await loader.persist();

                        if (process.env.PAGES_DEBUG_TRANSFORM === 'true') {
                          console.info(
                            '- pages',
                            'evaluated resources for',
                            filesToProcess.length,
                            'files'
                          );
                        }
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
