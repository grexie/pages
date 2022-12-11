import { Compilation } from 'webpack';
import { promisify } from '@grexie/promisify';
import { BuildContext } from './BuildContext.js';
import { ModuleLoaderType } from './ModuleLoader.js';
import type { Compiler } from 'webpack';
import { createRequire } from 'module';
import path from 'path';

export interface ModuleReference {
  readonly filename: string;
  readonly compile: boolean;
  readonly builtin: boolean;
  readonly loader: ModuleLoaderType;
}

export interface ModuleResolverConfig {
  extensions?: string[];
  forceCompileRoots?: string[];
  forceCompileExtensions?: string[];
  esmExtensions?: string[];
}

export interface ModuleResolverOptions extends ModuleResolverConfig {
  context: BuildContext;
  compilation: Compilation;
}

interface WebpackResolveInfo {
  filename: string;
  descriptionFile?: string;
  descriptionFileRoot?: string;
  descriptionFileData?: any;
}

const containsPath = (root: string, p: string) => {
  const relative = path.relative(root, p);
  return (
    !relative ||
    (!!relative && !relative.startsWith('..') && !path.isAbsolute(relative))
  );
};

export class ModuleResolver {
  readonly context: BuildContext;
  readonly compilation: Compilation;
  readonly #fs: Compiler['inputFileSystem'];
  readonly #realpath;
  readonly #stat;
  readonly #require: NodeJS.Require;
  readonly #extensions: string[];
  readonly #forceCompileRoots: string[];
  readonly #forceCompileExtensions: string[];
  readonly #esmExtensions: string[];
  readonly #resolve;

  constructor({
    context,
    compilation,
    extensions,
    forceCompileRoots,
    forceCompileExtensions,
    esmExtensions,
  }: ModuleResolverOptions) {
    this.context = context;
    this.compilation = compilation;
    this.#fs = this.compilation.compiler.inputFileSystem;
    this.#realpath = promisify(this.#fs, this.#fs.realpath!);
    this.#stat = promisify(this.#fs, this.#fs.stat);
    this.#require = createRequire(import.meta.url);
    this.#forceCompileRoots = forceCompileRoots ?? [];
    this.#extensions = extensions ?? [];
    this.#forceCompileExtensions = forceCompileExtensions ?? [];
    this.#esmExtensions = esmExtensions ?? [];

    const resolver = compilation.resolverFactory.get('loader', {
      fileSystem: compilation.compiler.inputFileSystem,
      conditionNames: ['import', 'default', 'require'],
      mainFields: ['module', 'main'],
      extensions: extensions,
      modules: context.modulesDirs,
      fullySpecified: false,
    });

    this.#resolve = async (
      context: string,
      request: string,
      fullySpecified: boolean = false
    ): Promise<WebpackResolveInfo> => {
      let _resolver = resolver;
      return new Promise((resolve, reject) => {
        _resolver.resolve(
          {},
          context,
          request,
          {},
          (err, result, requestResult) => {
            if (err) {
              this.context.root.sources
                .resolve({
                  context: path
                    .relative(this.context.rootDir, context)
                    .split(/\//g)
                    .filter(x => !!x),
                  request,
                })
                .then(({ abspath }) => {
                  return this.#resolve(context, abspath, true);
                })
                .then(resolve, reject);

              return;
            }

            if (typeof result !== 'string') {
              reject(new Error('not found'));
            }

            resolve({
              filename: result as string,
              descriptionFile: requestResult?.descriptionFilePath,
              descriptionFileRoot: requestResult?.descriptionFileRoot,
              descriptionFileData: requestResult?.descriptionFileData,
            });
          }
        );
      });
    };
  }

  async #buildImport(
    filename: string,
    {
      compile = false,
      builtin = false,
      loader = this.#esmExtensions.reduce(
        (a, b) => a || filename.endsWith(b),
        false
      )
        ? ModuleLoaderType.esm
        : ModuleLoaderType.commonjs,
      descriptionFileData,
    }: {
      compile?: boolean;
      builtin?: boolean;
      loader?: ModuleLoaderType;
      descriptionFileData?: any;
    } = {}
  ) {
    if (builtin) {
      loader = ModuleLoaderType.node;
    } else if (loader !== ModuleLoaderType.esm && descriptionFileData) {
      if (descriptionFileData.type === 'module' || descriptionFileData.module) {
        loader = ModuleLoaderType.esm;
      }
    }

    let o = { filename, loader } as ModuleReference;

    if (compile) {
      (o as any).compile = true;
    }

    if (builtin) {
      (o as any).builtin = true;
    }

    return o;
  }

  async resolve(context: string, request: string): Promise<ModuleReference> {
    if (/\!/.test(request)) {
      const requests = request.split(/\!/g);
      const result = (
        await Promise.all(
          requests.map(async requestParams => {
            const [requestPart, query] = requestParams.split('?', 2);
            if (requestPart) {
              return {
                ...(await this.resolve(context, requestPart)),
                query,
              };
            } else {
              return { filename: '', query };
            }
          })
        )
      )
        .map(
          result =>
            `${result.filename ? result.filename : ''}${
              result.query ? '?' : ''
            }${result.query ? result.query : ''}`
        )
        .join('!');

      return this.#buildImport(result, { compile: true });
    }

    let resolved: WebpackResolveInfo;
    try {
      resolved = await this.#resolve(context, request);
    } catch (err) {
      return this.#buildImport(request, { builtin: true });
    }

    resolved.filename = await this.#realpath(resolved.filename);

    const { descriptionFileData } = resolved;

    if (
      resolved.filename ===
      this.#require.resolve('@grexie/pages/defaults.pages')
    ) {
      return this.#buildImport(resolved.filename, {
        compile: true,
        descriptionFileData,
      });
    }

    if (
      this.#forceCompileExtensions.reduce(
        (a, b) => a || resolved.filename.endsWith(b),
        false
      )
    ) {
      return this.#buildImport(resolved.filename, {
        compile: true,
        descriptionFileData,
      });
    } else if (
      !this.#extensions.reduce(
        (a, b) => a || resolved.filename.endsWith(b),
        false
      )
    ) {
      return this.#buildImport(resolved.filename, {
        compile: true,
        descriptionFileData,
      });
    }

    const roots = await Promise.all(
      this.#forceCompileRoots.map(async module => {
        const filename = path.resolve(context, module);
        try {
          await this.#stat(filename);
          return filename;
        } catch (err) {
          try {
            const resolved = await this.#resolve(context, module);
            if (!resolved.descriptionFileRoot) {
              throw new Error(
                `couldn't resolve description file for root ${module}`
              );
            }
            return resolved.descriptionFileRoot;
          } catch (err) {
            return filename;
          }
        }
      })
    );

    if (
      !containsPath(
        path.resolve(this.context.rootDir, 'node_modules'),
        resolved.filename
      )
    ) {
      if (
        roots.reduce(
          (a, b) =>
            a ||
            (!containsPath(
              path.resolve(b, 'node_modules'),
              resolved.filename
            ) &&
              containsPath(b, resolved.filename)),
          false
        )
      ) {
        return this.#buildImport(resolved.filename, {
          compile: true,
          descriptionFileData,
        });
      }
    }

    return this.#buildImport(resolved.filename, {
      descriptionFileData,
    });
  }
}
