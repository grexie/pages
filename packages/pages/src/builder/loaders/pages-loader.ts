import { LoaderContext } from 'webpack';
import { BuildContext } from '../BuildContext.js';
import path from 'path';

interface PagesLoaderOptions {
  context: BuildContext;
}

export default async function PagesLoader(
  this: LoaderContext<PagesLoaderOptions>,
  content: Buffer,
  inputSourceMap: any
) {
  if (process.env.PAGES_DEBUG_LOADERS === 'true') {
    console.info('pages-loader', this.resourcePath);
  }
  const { context } = this.getOptions();
  const callback = this.async();

  this.cacheable();

  // const resolver = createResolver();
  // context.modules.addBuild(this.resourcePath, resolver);

  try {
    // const factory = modules.createModuleFactory(this._compilation!);

    // await context.modules.evict(factory, this.resourcePath, {
    //   recompile: true,
    //   fail: false,
    // });

    const modules = context.getModuleContext(this._compilation!);

    const configModule = await modules.createModule(
      path.dirname(this.resourcePath),
      this.resourcePath,
      content.toString()
    );

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

    // await context.modules.evict(factory, this.resourcePath, {
    //   recompile: true,
    // });

    modules.evict(this.resourcePath);

    callback(
      null,
      `
      import { ObjectProxy } from '@grexie/pages';

      const _metadata = ${JSON.stringify(metadata, null, 2)};

      export const config = (parent) => ObjectProxy.create({
        metadata: ${JSON.stringify(metadata, null, 2)},
        ...${JSON.stringify(config, null, 2)}
      }, parent);
      export const metadata = (parent) => ObjectProxy.create(_metadata, parent);
    `,
      inputSourceMap
    );
  } catch (err) {
    // resolver.reject(err);
    callback(err as any);
  } finally {
    if (process.env.PAGES_DEBUG_LOADERS === 'true') {
      console.info('pages-loader:complete', this.resourcePath);
    }
    // resolver.resolve();
  }
}
