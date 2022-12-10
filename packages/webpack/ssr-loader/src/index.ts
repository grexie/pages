import { LoaderContext } from 'webpack';
import { transformAsync } from '@babel/core';
import { SSRBabelPlugin } from './babel.js';

interface SSRLoaderOptions {
  context: BuildContext;
}

export default async function SSRLoader(
  this: LoaderContext<SSRLoaderOptions>,
  content: Buffer,
  inputSourceMap: any
) {
  const callback = this.async();
  this.cacheable(true);

  const { context } = this.getOptions();

  const plugin = SSRBabelPlugin({ context });

  try {
    const compiled = await transformAsync(content.toString(), {
      plugins: [plugin],
      inputSourceMap: inputSourceMap,
      sourceMaps: !!this.sourceMap,
    });

    callback(null, compiled!.code!, compiled!.map ?? undefined);
  } catch (err) {
    callback(err as any);
  }
}
