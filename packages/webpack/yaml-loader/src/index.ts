import { LoaderContext } from 'webpack';
import type { BuildContext } from '@grexie/pages-builder';

interface YamlLoaderOptions {
  context: BuildContext;
}

export default async function YamlLoader(
  this: LoaderContext<YamlLoaderOptions>,
  content: Buffer,
  inputSourceMap: any
) {
  const callback = this.async();

  const { default: YAML } = await import('yaml');
  const { SourceNode } = await import('source-map');
  this.cacheable(true);

  const documents = YAML.parseAllDocuments(content.toString());
  const document = documents[documents.length - 1];
  const chunk = `export default ${JSON.stringify(document, null, 2)};`;

  let map;

  if (this.sourceMap) {
    const node = new SourceNode(1, 1, this.resourcePath, chunk);
    node.setSourceContent(this.resourcePath, content.toString());
    map = JSON.parse(
      node.toStringWithSourceMap({ file: this.resourcePath }).map.toString()
    );
  }

  callback(null, chunk, map ?? inputSourceMap);
}
