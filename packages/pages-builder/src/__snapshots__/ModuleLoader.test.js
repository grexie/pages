// Jest Snapshot v1, https://goo.gl/fbAQLP

exports[`ModuleLoader should build a module 1`] = `
{
  "context": "",
  "filename": "test.jsx",
  "source": "
      import { wrapHandler as __pages_wrap_handler, hydrate as __pages_hydrate } from "@grexie/pages-runtime-handler";
      
      
      import __pages_refresh_runtime from '@grexie/pages-runtime-hmr';

      const __pages_refresh_global = typeof window === 'undefined' ? global : window;
      const __pages_previous_refreshreg = __pages_refresh_global.$RefreshReg$;
      const __pages_previous_refreshsig = __pages_refresh_global.$RefreshSig$;

      __pages_refresh_global.$RefreshReg$ = (type, id) => {
        const fullId = import.meta.url + ' ' + id;
        __pages_refresh_runtime.register(type, fullId);
      };
      __pages_refresh_global.$RefreshSig$ = __pages_refresh_runtime.createSignatureFunctionForTransform;
    
      var __pages_handler_component = function __pages_handler_component(_ref) {
  var children = _ref.children;
  return null;
};
      
      import { ObjectProxy as __pages_object_proxy } from '@grexie/proxy';
      
      import { metadata as __pages_metadata_1 } from "./.pages.yml"
import { metadata as __pages_metadata_2 } from "@grexie/pages/defaults.pages"

      export const resource = {
        path: ["test"],
        slug: "test",
        metadata: __pages_object_proxy.create({}, __pages_metadata_1(__pages_metadata_2())),
      }
    ;
      const __pages_handler = __pages_wrap_handler(
        resource,
        __pages_handler_component,
        
      );
      const __pages_hooks = {
  beforeRender:  [

  ],
  beforeDocument:  [

  ],
  afterDocument:  [

  ],
  afterRender:  [

  ]
};
      __pages_hydrate(resource, __pages_handler, __pages_hooks);

      export default __pages_handler;
      
      if (typeof module === 'undefined') {
        __pages_refresh_runtime.update(import.meta.webpackHot);
      } else {
          __pages_refresh_runtime.update(module.hot);
      }
      __pages_refresh_global.$RefreshReg$ = __pages_previous_refreshreg;
      __pages_refresh_global.$RefreshSig$ = __pages_previous_refreshsig;
    
    ",
}
`;
