// Jest Snapshot v1, https://goo.gl/fbAQLP

exports[`ModuleLoader should build a module 1`] = `
{
  "context": "",
  "filename": "test.jsx",
  "source": "import { wrapHandler as __pages_wrap_handler, hydrate as __pages_hydrate } from "@grexie/pages-runtime-handler";
var __pages_handler_component = function __pages_handler_component(_ref) {
  var children = _ref.children;
  return null;
};
import { ObjectProxy as __pages_object_proxy } from '@grexie/proxy';
import __pages_config_1 from "./.pages.yml";
import __pages_config_2 from "@grexie/pages/defaults.pages";
export const resource = {
  path: ["test"],
  slug: "test",
  config: __pages_object_proxy.create({
    "metadata": {}
  }, __pages_config_1(__pages_config_2())),
  get metadata() {
    return this.config.metadata;
  }
};
const __pages_handler = __pages_wrap_handler(resource, __pages_handler_component);
const __pages_hooks = {
  beforeRender: [],
  beforeDocument: [],
  afterDocument: [],
  afterRender: []
};
const __pages_root = __pages_hydrate(resource, __pages_handler, __pages_hooks);
export default __pages_handler;",
}
`;
