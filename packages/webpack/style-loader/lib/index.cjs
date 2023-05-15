"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = StyleLoader;
exports.parseVariables = void 0;
var _sourceMaps = require("@grexie/source-maps");
var _resolvable = require("@grexie/resolvable");
var _crypto = require("crypto");
var _css = require("css");
var _astTraverse = _interopRequireDefault(require("ast-traverse"));
var _module = require("module");
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
async function StyleLoader(content, inputSourceMap) {
  if (process.env.PAGES_DEBUG_LOADERS === 'true') {
    console.debug('style-loader', this.resourcePath);
  }
  const resolver = (0, _resolvable.createResolver)();
  // context.modules.addBuild(this.resourcePath, resolver);
  const callback = this.async();

  // const factory = context.modules.createModuleFactory(this._compilation!);

  try {
    const require = (0, _module.createRequire)(this.resourcePath);
    const module = {
      id: this.resourcePath,
      exports: {},
      require
    };
    new Function('module', 'exports', 'require', content.toString())(module, module.exports, require);
    const styles = module.exports;
    const css = styles.toString();
    const variables = parseVariables(css, this.resourcePath);
    const {
      locals
    } = styles;
    const hash = (0, _crypto.createHash)('md5').update(this.resourcePath).digest('hex');
    const chunk = `
    import { wrapStyles } from '@grexie/pages-runtime-styles';
    export default wrapStyles(${JSON.stringify(hash)}, ${JSON.stringify(css)}, ${JSON.stringify(locals, null, 2)}, ${JSON.stringify(variables)}); 
  `;
    let map;
    if (this.sourceMap) {
      map = inputSourceMap && (await (0, _sourceMaps.offsetLines)(inputSourceMap, chunk.split(/\r\n|\n/g).length));
    }
    callback(null, chunk, inputSourceMap);
  } catch (err) {
    callback(err);
    resolver.reject(err);
  } finally {
    if (process.env.PAGES_DEBUG_LOADERS === 'true') {
      console.debug('style-loader:complete', this.resourcePath);
    }
    resolver.resolve();
  }
}
const parseVariables = (css, resourcePath) => {
  const ast = (0, _css.parse)(css, {
    source: resourcePath
  });
  const variables = {};
  (0, _astTraverse.default)(ast, {
    pre: (node, parent) => {
      if (node.type === 'stylesheet') {
        node.children = node.stylesheet.rules;
      }
      if (node.type === 'declaration' && node.property.startsWith('--') && parent.selectors.includes(':root')) {
        variables[node.property] = node.value;
      }
    }
  });
  return variables;
};
exports.parseVariables = parseVariables;
//# sourceMappingURL=index.cjs.map