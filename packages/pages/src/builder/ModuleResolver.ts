import { Compilation } from 'webpack';
import { promisify } from '../utils/promisify.js';
import { BuildContext } from './BuildContext.js';
import type { ModuleReference } from './ModuleLoader.js';
import type { Compiler } from 'webpack';
import { createRequire } from 'module';

export interface ModuleResolverOptions {
  context: BuildContext;
  compilation: Compilation;
}

export class ModuleResolver {
  readonly context: BuildContext;
  readonly compilation: Compilation;
  readonly #fs: Compiler['inputFileSystem'];
  readonly #realpath: any;
  readonly #stat: any;
  readonly #require: NodeJS.Require;

  constructor({ context, compilation }: ModuleResolverOptions) {
    this.context = context;
    this.compilation = compilation;
    this.#fs = this.compilation.compiler.inputFileSystem;
    this.#realpath = promisify(this.#fs, this.#fs.realpath!);
    this.#stat = promisify(this.#fs, this.#fs.stat);
    this.#require = createRequire(import.meta.url);
    this.#forceCompile = Array.from(new Set([...forceCompile]));
    this.#extensions = Array.from(
      new Set(['.js', '.cjs', '.mjs', ...extensions])
    );
    this.#forceExtensions = Array.from(new Set([...forceExtensions]));
    this.#esm = [...new Set(['.mjs', ...esm])];
  }

  async #buildImport(
    factory: ModuleFactory,
    request: string,
    filename: string,
    {
      compile = false,
      builtin = false,
      esm = this.#esm.reduce((a, b) => a || filename.endsWith(b), false),
      descriptionFile,
    }: {
      compile?: boolean;
      builtin?: boolean;
      esm?: boolean;
      descriptionFile?: string;
    } = {}
  ) {
    if (!esm && descriptionFile) {
      const json = await this.#getDescriptionFile(factory, descriptionFile);

      if (json.type === 'module' || json.module) {
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

    return { [request]: o };
  }

  async #getDescriptionFile(
    factory: ModuleFactory,
    descriptionFile: string
  ): Promise<any> {
    if (!this.#descriptions[descriptionFile]) {
      const fs = factory.compilation.compiler.inputFileSystem;
      const readFile = promisify(fs, fs.readFile!);

      const description =
        this.#descriptions[descriptionFile] ??
        JSON.parse((await readFile(descriptionFile)).toString());
      this.#descriptions[descriptionFile] = description;
    }

    return this.#descriptions[descriptionFile];
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

      return this.#buildImport(request, result, { compile: true });
    }

    let resolved: { filename: string; descriptionFile?: string };
    try {
      resolved = await factory.resolve(context, request);
    } catch (err) {
      return this.#buildImport(factory, request, request, { builtin: true });
    }
    resolved.filename = await realpath(resolved.filename);
    if (resolved.descriptionFile) {
      resolved.descriptionFile = await realpath(resolved.descriptionFile);
    }
    const { descriptionFile } = resolved;

    if (
      resolved.filename ===
      this.#require.resolve(
        path.resolve(this.context.build.pagesDir, 'defaults.pages.js')
      )
    ) {
      return this.#buildImport(factory, request, resolved.filename, {
        compile: true,
        descriptionFile,
      });
    }

    if (
      this.#forceExtensions.reduce(
        (a, b) => a || resolved.filename.endsWith(b),
        false
      )
    ) {
      return this.#buildImport(factory, request, resolved.filename, {
        compile: true,
        descriptionFile,
      });
    } else if (
      !this.#extensions.reduce(
        (a, b) => a || resolved.filename.endsWith(b),
        false
      )
    ) {
      return this.#buildImport(factory, request, resolved.filename, {
        compile: true,
        descriptionFile,
      });
    }

    const roots = await Promise.all(
      this.#forceCompile.map(async module => {
        const filename = path.resolve(context, module);
        try {
          await stat(filename);
          return filename;
        } catch (err) {
          const resolved = await factory.resolve(context, module);
          if (!resolved.descriptionFile) {
            throw new Error(
              `couldn't resolve description file for root ${module}`
            );
          }
          return path.dirname(resolved.descriptionFile);
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
        return this.#buildImport(factory, request, resolved.filename, {
          compile: true,
          descriptionFile,
        });
      }
    }

    return this.#buildImport(factory, request, resolved.filename, {
      descriptionFile,
    });
  }
}
