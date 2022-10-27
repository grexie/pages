import { LoaderContext } from 'webpack';
import { BuildContext } from '../BuildContext';
import path from 'path';
import { createHash } from 'crypto';

interface ImageLoaderOptions {
  context: BuildContext;
}

export default async function ImageLoader(
  this: LoaderContext<ImageLoaderOptions>,
  content: Buffer
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
    const filename = path.resolve(
      this._compiler!.outputPath,
      'images',
      `${basename}-${hash}.${extname}`
    );

    this.emitFile(filename, content);

    return `
    const { wrapImage } = require('@grexie/pages/utils/image');
    module.exports = wrapImage(${JSON.stringify(filename)}, ${JSON.stringify(
      extname
    )});
  `;
  } finally {
    if (process.env.PAGES_DEBUG_LOADERS === 'true') {
      console.info('image-loader:complete', this.resourcePath);
    }
  }
}
