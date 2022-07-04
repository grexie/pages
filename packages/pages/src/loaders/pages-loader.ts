import { LoaderContext } from 'webpack';
import { BuildContext } from '../builder';
import path from 'path';
import { createResolver } from '../utils/resolvable';

interface PagesLoaderOptions {
  context: BuildContext;
}

export default async function ModuleLoader(
  this: LoaderContext<PagesLoaderOptions>,
  content: Buffer
) {
  if (process.env.PAGES_DEBUG_LOADERS === 'true') {
    console.info('pages-loader', this.resourcePath);
  }
  const { context, ...options } = this.getOptions();

  const resolver = createResolver();
  context.modules.addBuild(this.resourcePath, resolver);

  try {
    const factory = context.modules.createModuleFactory(this._compilation!);

    await context.modules.evict(factory, this.resourcePath, {
      recompile: true,
      fail: false,
    });

    const configModule = await context.modules.create(
      factory,
      this._module!,
      this.resourcePath,
      content.toString()
    );

    configModule.load(module);

    let configExports;
    if (typeof configModule.exports.default === 'function') {
      configExports = configModule.exports.default();
    } else if (typeof configModule.exports.default === 'object') {
      configExports = configModule.exports.default;
    } else if (typeof configModule.exports === 'function') {
      configExports = configModule.exports();
    } else {
      configExports = configModule.exports;
    }

    const { metadata = {}, ...config } = configExports;

    await context.modules.evict(factory, this.resourcePath, {
      recompile: true,
    });

    return `
      const { ObjectProxy } = require('@grexie/pages');

      const config = ${JSON.stringify(config, null, 2)};
      const metadata = ${JSON.stringify(metadata, null, 2)};

      exports.config = (parent) => ObjectProxy.create({ metadata, ...config }, parent);
      exports.metadata = (parent) => ObjectProxy.create(metadata, parent);
    `;
  } catch (err) {
    resolver.reject(err);
  } finally {
    resolver.resolve();
  }
}
