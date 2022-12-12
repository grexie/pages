import { transformFileAsync } from '@babel/core';
import fs from 'fs';
import { promisify } from 'util';
const exists = promisify(fs.exists);

export const resolve = async (specifier, context, next) => {
  // const next = async function () {
  //   const result = await _next(...arguments);

  //   const url = new URL(result.url);

  //   return result;
  // };

  const { pathname } = new URL(specifier, context.parentURL);

  if (
    pathname.endsWith('.js') &&
    (pathname.startsWith('/') ||
      pathname.startsWith('./') ||
      pathname.startsWith('../')) &&
    !/node_modules/.test(pathname)
  ) {
    if (await exists(pathname.replace(/\.js$/, '.ts'))) {
      return {
        url: new URL(
          specifier.replace(/\.js$/, '.ts'),
          context.parentURL
        ).toString(),
        format: 'module',
        shortCircuit: true,
      };
    } else if (await exists(pathname.replace(/\.js$/, '.tsx'))) {
      return {
        url: new URL(
          specifier.replace(/\.js$/, '.tsx'),
          context.parentURL
        ).toString(),
        format: 'module',
        shortCircuit: true,
      };
    }
  }

  return next(specifier, context);
};

export const load = async (_url, context, next) => {
  const url = new URL(_url);

  if (['.ts', '.tsx'].find(extname => url.pathname.endsWith(extname))) {
    const compiled = await transformFileAsync(url.pathname, {
      filename: url.pathname,
      presets: [
        '@babel/typescript',
        ['@babel/react', { runtime: 'automatic' }],
        [
          '@babel/env',
          {
            targets: 'node 18',
            modules: false,
          },
        ],
      ],
      sourceMaps: 'inline',
      retainLines: true,
      compact: false,
    });

    return {
      source: compiled.code,
      format: 'module',
      shortCircuit: true,
    };
  }

  return next(_url, context);
};
