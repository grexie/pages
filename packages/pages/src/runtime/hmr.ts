import runtime from 'react-refresh/runtime';

export const attach = (() => {
  let attached = new WeakSet();
  return (global: any) => {
    if (attached.has(global)) {
      return;
    }
    attached.add(global);

    console.info('attaching');
    runtime.injectIntoGlobalHook(global);
    global.$RefreshReg$ = () => {};
    global.$RefreshSig$ = () => (type: any) => type;
  };
})();

if (typeof window !== 'undefined') {
  attach(window);
} else if (typeof global !== 'undefined') {
  attach(global);
}
