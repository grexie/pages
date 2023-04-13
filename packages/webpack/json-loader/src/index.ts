import { LoaderContext } from 'webpack';

export default async function JSONLoader(
  this: LoaderContext<void>,
  content: Buffer,
  inputSourceMap: any
) {
  const callback = this.async();

  const document = JSON.parse(content.toString());
  let chunk = `export default ${JSON.stringify(document, null, 2)};`;

  callback(null, chunk, inputSourceMap);
}
