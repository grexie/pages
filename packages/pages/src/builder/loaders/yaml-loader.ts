import { LoaderContext } from 'webpack';
import { BuildContext } from '../BuildContext.js';
import YAML from 'yaml';

interface YamlLoaderOptions {
  context: BuildContext;
}

export default async function YamlLoader(
  this: LoaderContext<YamlLoaderOptions>,
  content: Buffer
) {
  const documents = YAML.parseAllDocuments(content.toString());
  const document = documents[documents.length - 1];

  return `export default ${JSON.stringify(document, null, 2)};`;
}
