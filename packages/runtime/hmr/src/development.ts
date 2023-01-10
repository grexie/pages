import runtime from 'react-refresh/runtime';
import { setTimeout, clearTimeout } from 'timers';

export const createSignatureFunctionForTransform =
  runtime.createSignatureFunctionForTransform;
export const register = runtime.register;

let timeout: NodeJS.Timer;

if (typeof window !== 'undefined') {
  const processMessage = (
    eventSource: EventSource,
    { action, ...options }: any
  ) => {
    switch (action) {
      case 'reload': {
        options.pathnames.forEach((thisPathname: string) => {
          let pathname = window.location.pathname;

          if (!pathname.endsWith('/')) {
            pathname += '/';
          }

          if (thisPathname === pathname) {
            setTimeout(() => {
              window.location.reload();
            }, 0);
          }
        });
        break;
      }
    }
  };

  const interval = setInterval(() => {
    const eventSource = (window as any).__whmEventSourceWrapper?.[
      '/__webpack/hmr'
    ];

    if (eventSource) {
      clearInterval(interval);
      eventSource.addMessageListener((event: any) => {
        try {
          const message = JSON.parse(event.data);
          processMessage(event.target, message);
        } catch (err) {}
      });
    }
  }, 50);
}

export const update = (hot: any) => {
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
