import type { RootBuildContext } from './BuildContext.js';
import type { ModuleLoader } from './ModuleLoader.js';
import path from 'path';

const baseUrl = new URL('file://');
baseUrl.pathname = `${process.cwd()}/`;

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

    console.info(reference);

    if (reference.compile) {
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

  return next(specifier, context);
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
        format:
          reference.loader === 'esm'
            ? NodeJS.LoaderHooks.ModuleFormat.module
            : NodeJS.LoaderHooks.ModuleFormat.commonjs,
        shortCircuit: true,
        source: module.source,
      };
    }
  }

  return next(url, context);
};
