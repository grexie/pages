import { LoaderContext } from 'webpack';
import { BuildContext } from '../BuildContext';
import path from 'path';
import { createHash } from 'crypto';
import webpack from 'webpack';
import sharp from 'sharp';
import { transform } from '@svgr/core';

const { RawSource } = webpack.sources;
interface ImageLoaderOptions {
  context: BuildContext;
}

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
      const { wrapImage } = require('@grexie/pages/runtime/image');
      module.exports = wrapImage(${JSON.stringify(
        path.resolve('/', filename)
      )}, ${JSON.stringify(metadata)});
    `;

    if (metadata.format === 'svg') {
      jsCode = await transform(
        content.toString(),
        {
          icon: true,
          jsx: {
            babelConfig: {
              presets: [
                require('@babel/preset-react'),
                [require('@babel/preset-env'), { modules: 'commonjs' }],
              ],
            },
          },
        },
        { filePath: path.relative(context.rootDir, this.resourcePath) }
      );
      jsCode = `
        const { wrapImageComponent } = require('@grexie/pages/runtime/image');
        module.exports = wrapImage(${JSON.stringify(
          path.resolve('/', filename)
        )}, ${JSON.stringify(metadata)});`;
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
