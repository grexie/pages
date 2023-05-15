"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = JSONLoader;
async function JSONLoader(content, inputSourceMap) {
  const {
    transform
  } = this.getOptions();
  const callback = this.async();
  const document = JSON.parse(content.toString());
  let chunk = `export default ${JSON.stringify(transform?.(document) ?? document, null, 2)};`;
  callback(null, chunk, inputSourceMap);
}
//# sourceMappingURL=index.cjs.map