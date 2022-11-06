import runtime from 'react-refresh/runtime';

export const attach = (global: any) => {
  runtime.injectIntoGlobalHook(global);
  global.$RefreshReg$ = () => {};
  global.$RefreshSig$ = () => (type: any) => type;
};

if (typeof window !== 'undefined') {
  attach(window);
} else if (typeof global !== 'undefined') {
  attach(global);
}
