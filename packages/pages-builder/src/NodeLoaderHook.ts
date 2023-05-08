import { builtinModules } from 'module';
import { ModuleLoader, ModuleLoaderType } from './ModuleLoader.js';
import enhancedResolve from 'enhanced-resolve';
import path from 'path';
import fs from 'fs';
import { createRequire } from 'module';

const __filename = new URL(import.meta.url).pathname;
const __dirname = path.dirname(__filename);

const rootDir = process.cwd();

const require = createRequire(rootDir);

const baseUrl = new URL('file://');
baseUrl.pathname = `${rootDir}/`;

const NODE_PATH = process.env.NODE_PATH?.split(/[:;]/g) ?? [
  path.resolve(process.cwd(), 'node_modules'),
];

let modulesDirs: string[] = [];
let dirname: string;

dirname = path.resolve(process.cwd(), process.env.PAGES_ROOT ?? '.');
while (dirname) {
  modulesDirs.push(path.resolve(dirname, 'node_modules'));
  if (path.dirname(dirname) === dirname) {
    break;
  }
  dirname = path.dirname(dirname);
}

dirname = __dirname;
while (dirname) {
  modulesDirs.push(path.resolve(dirname, 'node_modules'));
  if (path.dirname(dirname) === dirname) {
    break;
  }
  dirname = path.dirname(dirname);
}

const resolver = enhancedResolve.ResolverFactory.createResolver({
  fileSystem: fs as any,
  conditionNames: ['node', 'module', 'import', 'default', 'require'],
  // mainFields: ['module', 'main'],
  fullySpecified: false,
  ...(modulesDirs.length ? { modules: modulesDirs } : {}),
});

const createResolver = (context?: string) => {
  if (context) {
    context = path.dirname(new URL(context).pathname);
  } else {
    return resolver;
  }

  const contextModuleDirs = [path.join(context, 'node_modules')];

  let moduleDir = context;
  while (moduleDir !== path.resolve(moduleDir, '..')) {
    moduleDir = path.resolve(moduleDir, '..');
    contextModuleDirs.push(path.join(moduleDir, 'node_modules'));
  }

  const moduleDirs = [
    ...contextModuleDirs,
    ...((resolver.options.modules.reduce(
      (a, b) => [...a, ...(Array.isArray(b) ? b : [b])],
      []
    ) as string[]) ?? []),
  ];

  moduleDirs.sort((a, b) => {
    if (a.startsWith(rootDir) && !b.startsWith(rootDir)) {
      return 1;
    }
    if (!a.startsWith(rootDir) && b.startsWith(rootDir)) {
      return -1;
    }
    return 0;
  });

  let _resolver = enhancedResolve.ResolverFactory.createResolver({
    ...(resolver.options as any),
    modules: moduleDirs,
  });

  return _resolver;
};

export const resolve: NodeJS.LoaderHooks.Resolve = async (
  specifier,
  context,
  next
) => {
  const loader = (global as any).PagesModuleLoader as ModuleLoader;

  if (specifier.startsWith('node:') || builtinModules.includes(specifier)) {
    return next(specifier, context);
  }

  if (loader) {
    const rootDir = new URL('file://');
    rootDir.pathname = loader.context.build.rootDir;
    const { parentURL = rootDir.toString() } = context;
    const reference = await loader.resolver.resolve(
      path.dirname(new URL(parentURL).pathname),
      specifier
    );

    if (!reference.builtin) {
      const url = new URL(`file://`);
      url.pathname = path.resolve(
        new URL(parentURL).pathname,
        reference.filename
      );

      const result = {
        shortCircuit: true,
        url: url.href,
        format:
          reference.loader === 'esm'
            ? ('module' as NodeJS.LoaderHooks.ModuleFormat)
            : undefined,
      };

      return result;
    }
  }

  try {
    const { parentURL = baseUrl } = context;
    return await new Promise<{
      url: string;
      shortCircuit?: boolean;
    }>((resolve, reject) =>
      createResolver(context.parentURL).resolve(
        {},
        path.dirname(new URL(parentURL).pathname),
        specifier.startsWith('file:') ? new URL(specifier).pathname : specifier,
        {},
        (err, result, request) => {
          if (err) {
            reject(err);
            return;
          }

          resolve({
            url: `file://${result}`,
            shortCircuit: true,
          });
        }
      )
    );
  } catch (err) {
    return await next(specifier, context);
  }
};

export const load: NodeJS.LoaderHooks.Load = async (url, context, next) => {
  const loader = (global as any).PagesModuleLoader as ModuleLoader;

  if (loader) {
    const reference = await loader.resolver.resolve(
      path.dirname(new URL(url).pathname),
      new URL(url).pathname
    );

    if (reference.compile) {
      const module = await loader.context.requireModule(
        path.dirname(new URL(url).pathname),
        new URL(url).pathname
      );

      return {
        format: (reference.loader === 'esm'
          ? 'module'
          : 'commonjs') as NodeJS.LoaderHooks.ModuleFormat,
        shortCircuit: true,
        source: module.source,
      };
    }

    if (!reference.builtin) {
      let format: NodeJS.LoaderHooks.ModuleFormat;
      if (reference.loader === 'esm') {
        format = 'module' as NodeJS.LoaderHooks.ModuleFormat;
      } else if (reference.loader === 'commonjs') {
        format = 'commonjs' as NodeJS.LoaderHooks.ModuleFormat;
      }

      const _url = new URL(url);
      const source = await new Promise((resolve, reject) =>
        fs.readFile(_url.pathname, (err, buffer) => {
          if (err) {
            reject(err);
            return;
          }

          resolve(buffer.toString());
        })
      );

      return {
        format: format!,
        shortCircuit: true,
        source: source as string,
      };
    }
  }

  return next(url, context);
};
