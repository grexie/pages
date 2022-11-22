import type { RootBuildContext } from './BuildContext.js';
import type { ModuleLoader } from './ModuleLoader.js';
import path from 'path';

const baseUrl = new URL('file://');
baseUrl.pathname = `${process.cwd()}/`;

export async function resolve(specifier, { parentModuleUrl = baseUrl }, next) {
  const loader = (global as any).PagesModuleLoader as ModuleLoader;

  if (loader) {
    const reference = await loader.resolver.resolve(
      new URL(parentModuleUrl).pathname,
      specifier
    );

    console.info(reference);

    if (reference.compile) {
      const url = new URL(`file://`);
      url.pathname = path.resolve(
        new URL(parentModuleUrl).pathname,
        reference.filename
      );

      return {
        shortCircuit: true,
        url: url.href,
      };
    }
  }

  return next(specifier);
}

export async function load(url, { parentModuleUrl = baseUrl }, next) {
  const loader = (global as any).PagesModuleLoader as ModuleLoader;

  if (loader) {
    const reference = await loader.resolver.resolve(
      new URL(parentModuleUrl).pathname,
      new URL(url).pathname
    );

    if (reference.compile) {
      const module = await loader.context.requireModule(
        new URL(parentModuleUrl).pathname,
        new URL(url).pathname
      );

      return {
        format: reference.loader === 'esm' ? 'module' : 'commonjs',
        shortCircuit: true,
        source: module.source,
      };
    }
  }

  return next(url);
}
