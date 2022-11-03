import { LoaderContext } from 'webpack';
import { BuildContext } from '../BuildContext.js';
import { createResolver } from '../../utils/resolvable.js';
import { SourceNode } from 'source-map';

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

    await configModule.load();

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
    resolver.reject(err);
    callback(err as any);
  } finally {
    resolver.resolve();
  }
}
