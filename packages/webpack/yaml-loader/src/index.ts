import { LoaderContext } from 'webpack';

export interface YamlLoaderOptions {
  transform: (doc: any) => any;
}

export default async function YamlLoader(
  this: LoaderContext<YamlLoaderOptions>,
  content: Buffer,
  inputSourceMap: any
) {
  if (process.env.PAGES_DEBUG_LOADERS === 'true') {
    console.debug('yaml-loader', this.resourcePath);
  }

  const { transform } = this.getOptions();

  const callback = this.async();
  try {
    const { default: YAML } = await import('yaml');
    const { SourceNode } = await import('source-map');

    const documents = YAML.parseAllDocuments(content.toString());
    const document = documents[documents.length - 1];
    const chunk = `export default ${JSON.stringify(
      transform?.(document.toJSON()) ?? document,
      null,
      2
    )};`;

    let map;

    if (this.sourceMap) {
      const node = new SourceNode(1, 1, this.resourcePath, chunk);
      node.setSourceContent(this.resourcePath, content.toString());
      map = JSON.parse(
        node.toStringWithSourceMap({ file: this.resourcePath }).map.toString()
      );
    }

    callback(null, chunk, map ?? inputSourceMap);
  } catch (err: any) {
    console.error(err);
    callback(err);
  } finally {
    if (process.env.PAGES_DEBUG_LOADERS === 'true') {
      console.debug('yaml-loader:complete', this.resourcePath);
    }
  }
}
