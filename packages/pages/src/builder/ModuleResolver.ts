import { Compilation } from 'webpack';
import { promisify } from '../utils/promisify.js';
import { BuildContext } from './BuildContext.js';
import type { ModuleReference } from './ModuleLoader.js';
import type { Compiler } from 'webpack';
import { createRequire } from 'module';
import path from 'path';

export interface ModuleResolverOptions {
  context: BuildContext;
  compilation: Compilation;
  extensions?: string[];
  forceCompileRoots?: string[];
  forceCompileExtensions?: string[];
  esmExtensions?: string[];
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
    this.#forceCompileRoots = [...new Set([...(forceCompileRoots ?? [])])];
    this.#extensions = [
      ...new Set(['.js', '.cjs', '.mjs', ...(extensions ?? [])]),
    ];
    this.#forceCompileExtensions = [
      ...new Set([...(forceCompileExtensions ?? [])]),
    ];
    this.#esmExtensions = [...new Set(['.mjs', ...(esmExtensions ?? [])])];

    const resolver = compilation.resolverFactory.get('loader', {
      fileSystem: compilation.compiler.inputFileSystem,
      conditionNames: ['default', 'require', 'import'],
      mainFields: ['module', 'main'],
      extensions: ['.md', '.js', '.jsx', '.ts', '.tsx', '.cjs', '.mjs'],
      alias: {
        '@grexie/pages': this.context.pagesDir,
      },
      modules: context.modulesDirs,
    });

    this.#resolve = async (
      context: string,
      request: string
    ): Promise<WebpackResolveInfo> => {
      return new Promise((resolve, reject) =>
        resolver.resolve({}, context, request, {}, (err, result, request) => {
          if (err) {
            reject(err);
            return;
          }

          if (typeof result !== 'string') {
            reject(new Error('not found'));
          }

          resolve({
            filename: result as string,
            descriptionFile: request?.descriptionFilePath,
            descriptionFileRoot: request?.descriptionFileRoot,
            descriptionFileData: request?.descriptionFileData,
          });
        })
      );
    };
  }

  async #buildImport(
    filename: string,
    {
      compile = false,
      builtin = false,
      esm = this.#esmExtensions.reduce(
        (a, b) => a || filename.endsWith(b),
        false
      ),
      descriptionFileData,
    }: {
      compile?: boolean;
      builtin?: boolean;
      esm?: boolean;
      descriptionFileData?: any;
    } = {}
  ) {
    if (!esm && descriptionFileData) {
      if (descriptionFileData.type === 'module' || descriptionFileData.module) {
        esm = true;
      }
    }

    let o = { filename, esm } as any;

    if (compile) {
      o.compile = true;
    }

    if (builtin) {
      o.builtin = true;
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
      this.#require.resolve(
        path.resolve(this.context.pagesDir, 'defaults.pages.js')
      )
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
          const resolved = await this.#resolve(context, module);
          if (!resolved.descriptionFileRoot) {
            throw new Error(
              `couldn't resolve description file for root ${module}`
            );
          }
          return resolved.descriptionFileRoot;
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
        roots.reduce((a, b) => a || containsPath(b, resolved.filename), false)
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
