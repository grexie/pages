import runtime from 'react-refresh/runtime';
import { setTimeout, clearTimeout } from 'timers';
export const createSignatureFunctionForTransform =
  runtime.createSignatureFunctionForTransform;
export const register = runtime.register;

let timeout: NodeJS.Timer;
export const update = (hot: any) => {
  if (hot) {
    hot.accept((...args: any[]) => {
      console.info('accepted', args);
    });
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      runtime.performReactRefresh();
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
