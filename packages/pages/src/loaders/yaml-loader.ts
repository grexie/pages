import { LoaderContext } from 'webpack';
import { BuildContext } from '../builder';
import YAML from 'yaml';

interface YamlLoaderOptions {
  context: BuildContext;
}

export default async function ModuleLoader(
  this: LoaderContext<YamlLoaderOptions>,
  content: Buffer
) {
  console.info('yaml-loader', this.resourcePath);

  const documents = YAML.parseAllDocuments(content.toString());
  const document = documents[documents.length - 1];

  return `module.exports = ${JSON.stringify(document, null, 2)};`;
}
