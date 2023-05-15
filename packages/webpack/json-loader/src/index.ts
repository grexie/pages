import { LoaderContext } from 'webpack';

export interface JSONLoaderOptions {
  transform: (doc: any) => any;
}

export default async function JSONLoader(
  this: LoaderContext<JSONLoaderOptions>,
  content: Buffer,
  inputSourceMap: any
) {
  const { transform } = this.getOptions();
  const callback = this.async();

  const document = JSON.parse(content.toString());
  let chunk = `export default ${JSON.stringify(
    transform?.(document) ?? document,
    null,
    2
  )};`;

  callback(null, chunk, inputSourceMap);
}
