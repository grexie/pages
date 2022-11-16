import { LoaderContext } from 'webpack';
import type { BuildContext } from '@grexie/pages-builder';
import { offsetLines } from '@grexie/source-maps';
import { createResolver } from '@grexie/resolvable';
import { createHash } from 'crypto';

import path from 'path';

interface StyleLoaderOptions {
  context: BuildContext;
}

export default async function StyleLoader(
  this: LoaderContext<StyleLoaderOptions>,
  content: Buffer,
  inputSourceMap: any
) {
  this.cacheable(false);

  if (process.env.PAGES_DEBUG_LOADERS === 'true') {
    console.info('style-loader', this.resourcePath);
  }
  const { context } = this.getOptions();
  const resolver = createResolver();
  // context.modules.addBuild(this.resourcePath, resolver);
  const callback = this.async();

  const modules = context.getModuleContext(this._compilation!);

  // const factory = context.modules.createModuleFactory(this._compilation!);

  try {
    const stylesModule = await modules.createModule(
      path.dirname(this.resourcePath),
      this.resourcePath,
      `const module = ${JSON.stringify({ id: this.resourcePath })};\n` +
        content.toString()
    );

    const styles = stylesModule.exports.default;
    const css = styles.toString();
    const { locals } = styles;
    const hash = createHash('md5')
      .update(this.resourcePath)
      .digest('hex')
      .substring(0, 8);

    const chunk = `
    import { wrapStyles } from '@grexie/pages-runtime-styles';
    export default wrapStyles(${JSON.stringify(hash)}, ${JSON.stringify(
      css
    )}, ${JSON.stringify(locals, null, 2)}); 
  `;

    let map;

    if (this.sourceMap) {
      map =
        inputSourceMap &&
        offsetLines(inputSourceMap, chunk.split(/\r\n|\n/g).length);
    }

    callback(null, chunk, map as any);
  } catch (err) {
    callback(err as any);
    resolver.reject(err);
  } finally {
    if (process.env.PAGES_DEBUG_LOADERS === 'true') {
      console.info('style-loader:complete', this.resourcePath);
    }

    resolver.resolve();
  }
}
