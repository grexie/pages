const { transformFileAsync } = require('@babel/core');
const fs = require('fs');
const { promisify } = require('util');
const exists = promisify(fs.exists);

exports.resolve = async (specifier, context, _next) => {
  const next = async function () {
    const result = await _next(...arguments);

    const url = new URL(result.url);

    if (url.protocol === 'file:' && !result.format) {
      result.format = 'module';
    }

    return result;
  };

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

exports.load = async (_url, context, next) => {
  const url = new URL(_url);

  if (['.ts', '.tsx'].find(extname => url.pathname.endsWith(extname))) {
    const compiled = await transformFileAsync(url.pathname, {
      presets: [
        '@babel/typescript',
        ['@babel/react', { runtime: 'automatic' }],
        [
          '@babel/env',
          {
            targets: 'node 16',
            modules: false,
          },
        ],
      ],
      sourceMaps: 'inline',
      retainLines: true,
    });

    return {
      source: compiled.code,
      format: 'module',
      shortCircuit: true,
    };
  }

  return next(_url, context);
};
