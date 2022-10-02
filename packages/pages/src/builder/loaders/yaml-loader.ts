import { LoaderContext } from 'webpack';
import { BuildContext } from '../BuildContext';
import YAML from 'yaml';

interface YamlLoaderOptions {
  context: BuildContext;
}

export default async function ModuleLoader(
  this: LoaderContext<YamlLoaderOptions>,
  content: Buffer
) {
  const documents = YAML.parseAllDocuments(content.toString());
  const document = documents[documents.length - 1];

  return `module.exports = ${JSON.stringify(document, null, 2)};`;
}
