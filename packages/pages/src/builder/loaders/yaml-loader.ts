import { LoaderContext } from 'webpack';
import { BuildContext } from '../BuildContext.js';
import YAML from 'yaml';
import { SourceNode } from 'source-map';

interface YamlLoaderOptions {
  context: BuildContext;
}

export default async function YamlLoader(
  this: LoaderContext<YamlLoaderOptions>,
  content: Buffer,
  inputSourceMap: any
) {
  const { context } = this.getOptions();
  const callback = this.async();
  this.cacheable();

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

  const modules = context.getModuleContext(this._compilation!);
  modules.evict(this.resourcePath);
}
