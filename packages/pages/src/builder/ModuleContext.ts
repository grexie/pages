import { BuildContext } from './BuildContext';
import type { LoaderContext, NormalModule } from 'webpack';
import _Module from 'module';
import { ModuleCompiler } from './ModuleCompiler';
import { realpath } from 'fs/promises';
import { Script } from 'vm';
import path from 'path';
import { createResolver } from '../utils/resolvable';
import { readFile } from 'fs/promises';

type WrappedScript = (
  exports: any,
  require: NodeJS.Require,
  module: _Module,
  __filename: string,
  __dirname: string
) => void;

const wrapScript = (code: string): string =>
  `(exports, require, module, __filename, __dirname) => {\n${code}\n}`;

const containsPath = (root: string, p: string) => {
  const relative = path.relative(root, p);
  return relative && !relative.startsWith('..') && !path.isAbsolute(relative);
};

const cloneRequire = (
  original: _Module,
  fn: (request: string) => any
): NodeRequire => {
  const require = fn as NodeRequire;
  require.resolve = original.require.resolve;
  require.main = original.require.main;
  require.cache = original.require.cache;
  require.extensions = original.require.extensions;
  return require;
};

interface Import {
  readonly compile: boolean;
  readonly filename: string;
}

type ModuleLoader = (parent: _Module) => _Module;

export interface ModuleOptions {
  filename: string;
  source: string;
  loader: ModuleLoader;
  imports: Record<string, Import>;
}

export class Module {
  readonly filename: string;
  readonly source: string;
  readonly load: ModuleLoader;
  readonly imports: Readonly<Record<string, Import>>;
  #module?: _Module;

  static #id = 0;
  readonly id = ++Module.#id;

  constructor({ filename, source, loader, imports }: ModuleOptions) {
    this.filename = filename;
    this.source = source;
    this.load = (parent: _Module) => {
      this.#module = loader(parent);
      (this.#module! as any).moduleInfo = this;
      return this.#module;
    };
    this.imports = imports;
  }

  get module() {
    if (!this.#module) {
      throw new Error(`module ${this.filename} not loaded, did you call load?`);
    }

    return this.#module;
  }

  get exports() {
    return this.module.exports;
  }
}

type Modules = Record<string, Promise<Module> | undefined>;

export class ModuleResolver {
  readonly context: BuildContext;
  readonly #resolve;
  readonly #loader;
  readonly #descriptions: Record<string, any> = {};

  constructor(context: BuildContext, loader: LoaderContext<any>) {
    this.context = context;
    this.#loader = loader;

    this.#resolve = loader.getResolve({
      conditionNames: ['default', 'require', 'import'],
      mainFields: ['main', 'module'],
      modules: context.modulesDirs,
    });
  }

  async resolve(
    context: string,
    request: string
  ): Promise<{ filename: string; descriptionFile: string }> {
    return new Promise((resolve, reject) =>
      this.#resolve(context, request, (err, result, request) => {
        if (err) {
          reject(err);
          return;
        }

        if (typeof result !== 'string') {
          reject(new Error('not found'));
        }

        resolve({
          filename: result as string,
          descriptionFile: request?.descriptionFilePath!,
        });
      })
    );
  }

  async resolveImports(
    context: string,
    imports: string[]
  ): Promise<Record<string, Import>> {
    const out = await Promise.all(
      imports.map(async request => {
        let imp = { compile: false, request, filename: request } as any;

        try {
          Object.assign(imp, await this.resolve(context, request));
          imp.compile = true;
        } catch (err) {}

        if (!imp.compile) {
          return imp;
        }

        imp.filename = await realpath(imp.filename);

        if (
          !imp.filename.endsWith('.mjs') &&
          (!containsPath(this.context.rootDir, imp.filename) ||
            containsPath(
              path.resolve(this.context.rootDir, 'node_modules'),
              imp.filename
            ))
        ) {
          const description =
            this.#descriptions[imp.descriptionFile] ??
            JSON.parse((await readFile(imp.descriptionFile)).toString());
          this.#descriptions[imp.descriptionFile] = description;

          if (description.type !== 'module') {
            imp.compile = false;
          }
        }

        return imp;
      })
    );

    return out.reduce(
      (a, b) => ({
        ...a,
        [b.request]: { compile: b.compile, filename: b.filename },
      }),
      {}
    ) as Record<string, Import>;
  }

  async load(filename: string) {
    return new Promise<{
      source: string;
      sourceMap: string;
      module: NormalModule;
    }>((resolve, reject) => {
      this.#loader.loadModule(filename, (err, source, sourceMap, module) => {
        if (err) {
          reject(err);
          return;
        }

        resolve({ source, sourceMap, module });
      });
    });
  }
}
export class ModuleContext {
  readonly build: BuildContext;
  readonly #modules: Modules = {};
  readonly #compiler: ModuleCompiler;

  constructor(context: BuildContext) {
    this.build = context;
    this.#compiler = new ModuleCompiler({ context: this });
  }

  createResolver(loader: LoaderContext<any>) {
    return new ModuleResolver(this.build, loader);
  }

  evict(filename: string) {
    delete this.#modules[filename];
    const module = require.cache[filename];
    delete require.cache[filename];
    module?.parent?.children.splice(module.parent.children.indexOf(module), 1);
    module?.children.forEach(module => this.evict(module.id));
  }

  async require(resolver: ModuleResolver, context: string, request: string) {
    const { filename } = await resolver.resolve(context, request);
    const { module, source } = await resolver.load(filename);
    return this.create(resolver, module.context!, filename, source);
  }

  #createRequire(
    modules: Record<string, Module>,
    _module: _Module,
    _filename: string
  ) {
    const _require = _module.require;
    const module = modules[_filename];
    _module.require = cloneRequire(_module, request => {
      const { compile, filename } = module.imports[request] ?? {
        compile: false,
        filename: request,
      };

      if (!compile) {
        return _require(filename);
      }

      if (_require.cache[filename]) {
        return _require.cache[filename]!.exports;
      }

      const { load } = modules[filename];
      const m = load(_module);
      return m.exports;
    });

    return _module.require;
  }

  async create(
    resolver: ModuleResolver,
    context: string,
    filename: string,
    source: string,
    modules: Record<string, Module> = {}
  ): Promise<Module> {
    if (this.#modules[filename]) {
      if (!modules[filename]) {
        const module = await this.#modules[filename]!;
        modules[filename] = module;
      }

      return this.#modules[filename]!;
    }

    const promise = createResolver<Module>();
    this.#modules[filename] = promise;

    const compiled = await this.#compiler.compile({ source, filename });
    const imports = await resolver.resolveImports(context, compiled.imports);

    await Promise.all(
      Object.entries(imports).map(async ([request, require]) => {
        if (!require.compile || this.#modules[require.filename]) {
          return;
        }

        const { source, module } = await resolver.load(require.filename);
        return this.create(
          resolver,
          module.context!,
          require.filename,
          source,
          modules
        );
      })
    );

    const script = new Script(wrapScript(compiled.source), {
      filename,
      displayErrors: true,
    }).runInThisContext() as WrappedScript;

    let _module: _Module;
    const loader = (parent?: _Module) => {
      if (_module) {
        return _module;
      }

      _module = new _Module(filename, parent);
      _module.require = _Module.createRequire(filename);
      _module.require = this.#createRequire(modules, _module, filename);
      _module.require.cache[filename] = _module;

      script(
        _module.exports,
        _module.require,
        _module,
        filename,
        path.dirname(filename)
      );

      return _module;
    };

    const module = new Module({
      filename,
      source: compiled.source,
      loader,
      imports,
    });

    promise.resolve(module);
    modules[filename] = module;
    return promise;
  }
}
