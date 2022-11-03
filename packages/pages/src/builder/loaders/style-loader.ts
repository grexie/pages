import { LoaderContext } from 'webpack';
import { BuildContext } from '../BuildContext.js';
import { createHash } from 'crypto';
import { SourceNode } from 'source-map';

interface StyleLoaderOptions {
  context: BuildContext;
}

export default async function StyleLoader(
  this: LoaderContext<StyleLoaderOptions>,
  content: Buffer,
  inputSourceMap: any
) {
  if (process.env.PAGES_DEBUG_LOADERS === 'true') {
    console.info('style-loader', this.resourcePath);
  }
  const { context } = this.getOptions();
  const factory = context.modules.createModuleFactory(this._compilation!);

  try {
    const stylesModule = await context.modules.create(
      factory,
      this._module!,
      this.resourcePath,
      `const module = { id: ${JSON.stringify(
        this.resourcePath
      )} };\n${content.toString()}`
    );

    await stylesModule.load();
    const styles = stylesModule.exports.default;
    const css = styles.toString();
    const { locals } = styles;
    const hash = createHash('md5').update(css).digest('hex').substring(0, 8);

    const chunk = `
    import { wrapStyles } from '@grexie/pages/runtime/styles';
    export default wrapStyles(${JSON.stringify(hash)}, ${JSON.stringify(
      css
    )}, ${JSON.stringify(locals, null, 2)}); 
  `;

    let map;

    if (this.sourceMap) {
      const node = new SourceNode(1, 1, this.resourcePath, chunk);
      node.setSourceContent(
        this.resourcePath,
        inputSourceMap.sourcesContent[
          inputSourceMap.sources.indexOf(this.resourcePath)
        ]
      );
      map = JSON.parse(
        node.toStringWithSourceMap({ file: this.resourcePath }).map.toString()
      );
    }
  } catch (err) {
    console.error(err);
    throw err;
  } finally {
    await context.modules.evict(factory, this.resourcePath, {
      recompile: true,
    });

    if (process.env.PAGES_DEBUG_LOADERS === 'true') {
      console.info('style-loader:complete', this.resourcePath);
    }
  }
}
