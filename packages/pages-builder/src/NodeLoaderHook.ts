import type { RootBuildContext } from './BuildContext.js';
import type { ModuleLoader } from './ModuleLoader.js';
import enhancedResolve from 'enhanced-resolve';
import path from 'path';
import fs from 'fs';

const baseUrl = new URL('file://');
baseUrl.pathname = `${process.cwd()}/`;

const resolver = enhancedResolve.ResolverFactory.createResolver({
  fileSystem: fs,
  modules: [
    path.resolve(process.cwd(), 'node_modules'),
    path.resolve(new URL(import.meta.url).pathname, '..', 'node_modules'),
  ],
  fullySpecified: false,
});

export const resolve: NodeJS.LoaderHooks.Resolve = async (
  specifier,
  context,
  next
) => {
  const { parentURL = baseUrl } = context;
  const loader = (global as any).PagesModuleLoader as ModuleLoader;

  if (loader) {
    const reference = await loader.resolver.resolve(
      new URL(parentURL).pathname,
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
      };
    }
  }

  try {
    return await next(specifier, context);
  } catch (err) {
    return await new Promise<string>((resolve, reject) =>
      resolver.resolve(
        {},
        path.dirname(new URL(parentURL).pathname),
        specifier,
        {},
        (err, result) => {
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
