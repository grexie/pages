import { LoaderContext } from 'webpack';
import { BuildContext } from '../BuildContext';

interface StyleLoaderOptions {
  context: BuildContext;
}

export default async function StyleLoader(
  this: LoaderContext<StyleLoaderOptions>,
  content: Buffer
) {
  if (process.env.PAGES_DEBUG_LOADERS === 'true') {
    console.info('style-loader', this.resourcePath, this.request);
  }
  const { context } = this.getOptions();
  const factory = context.modules.createModuleFactory(this._compilation!);

  try {
    const stylesModule = await context.modules.create(
      factory,
      this._module!,
      this.resourcePath,
      content.toString()
    );

    const styles = stylesModule.load(module).exports.default;
    const css = styles.toString();
    const { locals } = styles;
    return `
    const { wrapStyles } = require('@grexie/pages/utils/styles');
    module.exports = wrapStyles(${JSON.stringify(css)}, ${JSON.stringify(
      locals,
      null,
      2
    )}); 
  `;
  } finally {
    await context.modules.evict(factory, this.resourcePath, {
      recompile: true,
    });

    if (process.env.PAGES_DEBUG_LOADERS === 'true') {
      console.info('style-loader:complete', this.resourcePath);
    }
  }
}
