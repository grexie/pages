import { LoaderContext } from 'webpack';
import { BuildContext } from '../BuildContext';
import path from 'path';
import { createHash } from 'crypto';
import webpack from 'webpack';
import sharp, { Metadata } from 'sharp';
import { transform } from '@svgr/core';
import { transform as babelTransform } from '@babel/core';
import babelPresetReact from '@babel/preset-react';
import babelPresetEnv from '@babel/preset-env';

const { RawSource } = webpack.sources;
interface ImageLoaderOptions {
  context: BuildContext;
}

const SvgrTemplate =
  (metadata: Metadata) =>
  ({ imports, props, jsx }: any, { tpl }: any) => {
    return tpl`
    ${imports}
    import { wrapImageComponent } from '@grexie/pages/runtime/image' ;
    export default wrapImageComponent((${props}) => ${jsx}, ${JSON.stringify(
      metadata
    )});
  `;
  };

export default async function ImageLoader(
  this: LoaderContext<ImageLoaderOptions>
) {
  if (process.env.PAGES_DEBUG_LOADERS === 'true') {
    console.info('image-loader', this.resourcePath);
  }

  const { context } = this.getOptions();

  try {
    const basename = path.basename(this.resourcePath).replace(/\.\w+$/i, '');
    const extname = path.extname(this.resourcePath);
    const hash = createHash('md5')
      .update(path.relative(context.rootDir, this.resourcePath))
      .digest('hex')
      .substring(0, 6);
    const filename = path.join('images', `${basename}-${hash}${extname}`);

    const content = await context.fs.readFile(this.resourcePath);
    const image = await sharp(content);
    const metadata = await image.metadata();

    let jsCode = `
      import { wrapImage } from '@grexie/pages/runtime/image';
      export default wrapImage(${JSON.stringify(
        path.resolve('/', filename)
      )}, ${JSON.stringify(metadata)});
    `;

    if (metadata.format === 'svg') {
      jsCode = await transform(
        content.toString(),
        {
          icon: true,
          template: SvgrTemplate(metadata),
          expandProps: 'end',
          replaceAttrValues: {
            '#000': 'currentColor',
            '#000000': 'currentColor',
            '#558eff': 'currentColor',
          },
        },
        {
          filePath: path.relative(context.rootDir, this.resourcePath),
        }
      );

      jsCode = babelTransform(jsCode, {
        presets: [babelPresetReact, [babelPresetEnv, { modules: false }]],
      })?.code!;
    } else {
      this._compilation?.emitAsset(filename, new RawSource(content, false));
    }

    return jsCode;
  } finally {
    if (process.env.PAGES_DEBUG_LOADERS === 'true') {
      console.info('image-loader:complete', this.resourcePath);
    }
  }
}