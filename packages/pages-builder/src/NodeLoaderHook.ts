import { builtinModules } from 'module';
import type { ModuleLoader } from './ModuleLoader.js';
import enhancedResolve from 'enhanced-resolve';
import path from 'path';
import fs from 'fs';

const baseUrl = new URL('file://');
baseUrl.pathname = `${process.cwd()}/`;

const NODE_PATH = process.env.NODE_PATH?.split(/[:;]/g) ?? [
  path.resolve(process.cwd(), 'node_modules'),
];

const resolver = enhancedResolve.ResolverFactory.createResolver({
  fileSystem: fs as any,
  conditionNames: ['node', 'import', 'default', 'require'],
  mainFields: ['module', 'main'],
  // modules: context.modulesDirs,
  fullySpecified: false,
});

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

      return {
        shortCircuit: true,
        url: url.href,
        format:
          reference.loader === 'esm'
            ? ('module' as NodeJS.LoaderHooks.ModuleFormat)
            : undefined,
      };
    }
  }

  try {
    const { parentURL = baseUrl } = context;
    return await new Promise<{
      url: string;
      shortCircuit?: boolean;
    }>((resolve, reject) =>
      resolver.resolve(
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
  }

  return next(url, context);
};
