import { transformAsync } from '@babel/core';
export default async function MetadataLoader(content, inputSourceMap) {
  if (process.env.PAGES_DEBUG_LOADERS === 'true') {
    console.debug('metadata-loader', this.resourcePath);
  }
  const callback = this.async();
  try {
    const compiled = await transformAsync(content.toString(), {
      plugins: [configModulePlugin],
      filename: this.resourcePath,
      sourceFileName: this.resourcePath,
      inputSourceMap: inputSourceMap,
      sourceMaps: !!this.sourceMap
    });
    callback(null, compiled?.code ?? '', compiled.map);
  } catch (err) {
    console.error(err);
    callback(err);
  } finally {
    if (process.env.PAGES_DEBUG_LOADERS === 'true') {
      console.debug('metadata-loader:complete', this.resourcePath);
    }
  }
}
const configModulePlugin = ({
  types: t
}) => ({
  visitor: {
    ExportDefaultDeclaration: {
      enter: path => {
        path.insertBefore(t.importDeclaration([t.importSpecifier(t.identifier('__pages_wrap_metadata'), t.identifier('wrapMetadata'))], t.stringLiteral('@grexie/pages-runtime-metadata')));
        path.insertBefore(t.variableDeclaration('const', [t.variableDeclarator(t.identifier('__pages_metadata'), path.node.declaration)]));
        path.remove();
      }
    },
    Program: {
      exit(path) {
        path.node.body.push(t.exportDefaultDeclaration(t.callExpression(t.identifier('__pages_wrap_metadata'), [t.identifier('__pages_metadata')])));
      }
    }
  }
});
//# sourceMappingURL=index.mjs.map