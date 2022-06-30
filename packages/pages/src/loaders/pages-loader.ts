import { LoaderContext } from 'webpack';
import { BuildContext } from '../builder';
import path from 'path';

interface PagesLoaderOptions {
  context: BuildContext;
}

export default async function ModuleLoader(
  this: LoaderContext<PagesLoaderOptions>,
  content: Buffer
) {
  console.info('pages-loader', this.resourcePath);
  const { context, ...options } = this.getOptions();
  const factory = context.modules.createModuleFactory(this._compilation!);

  await context.modules.evict(factory, this.resourcePath, { recompile: true });

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

  await context.modules.evict(factory, this.resourcePath, { recompile: true });
  return `
    exports.config = ${JSON.stringify(config, null, 2)};

    exports.metadata = ${JSON.stringify(metadata, null, 2)};
  `;
}
