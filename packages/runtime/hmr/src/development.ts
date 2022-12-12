import type { ComponentType } from 'react';
import runtime from 'react-refresh/runtime';
import { setTimeout, clearTimeout } from 'timers';

export const createSignatureFunctionForTransform =
  runtime.createSignatureFunctionForTransform;
export const register = runtime.register;

let timeout: NodeJS.Timer;

if (typeof window !== 'undefined') {
  import('webpack-hot-middleware/client.js').then(client => {
    client.subscribe(action => {
      console.info('action', action);
    });
  });
}

export const update = (hot: any, rootElement: ComponentType) => {
  if (hot) {
    hot.accept();
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      const updates = runtime.performReactRefresh();
      // (window as any).__PAGES_ROOT__?.rerender();
    }, 300);
  }
};

export const attach = (() => {
  let attached = new WeakSet();
  return (global: any) => {
    if (attached.has(global)) {
      return;
    }
    attached.add(global);

    runtime.injectIntoGlobalHook(global);
    global.$RefreshReg$ = () => {};
    global.$RefreshSig$ = () => (type: any) => type;
  };
})();

export default {
  createSignatureFunctionForTransform,
  register,
  update,
  attach,
};

if (typeof window !== 'undefined') {
  attach(window);
} else if (typeof global !== 'undefined') {
  attach(global);
}

update((module as any).hot);
