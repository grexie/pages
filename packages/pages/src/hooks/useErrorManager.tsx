import React from 'react';
import type { ComponentType, ComponentClass, FunctionComponent } from 'react';
import { createContextWithProps } from '../utils/context.js';

const WrapComponentTable = new WeakMap();

const whitelist = <T extends Object>(Component: T): T => {
  WrapComponentTable.set(Component, true);
  return Component;
};

export interface ErrorBoundaryProps {}

export const {
  Provider: ErrorProvider,
  with: withErrorManager,
  use: useErrorManager,
} = createContextWithProps<ErrorManager, { errorManager: ErrorManager }>(
  whitelist(Provider => ({ errorManager, children }) => {
    if (useErrorManager()) {
      return <>{children}</>;
    }

    whitelist(Provider);

    return <Provider value={errorManager}>{children}</Provider>;
  })
);

const wrapComponentClass = <T extends any = {}>(
  Component: ComponentClass<T>
): ComponentClass<T> => {
  return Component;
};

const wrapFunctionComponent = <T extends any = {}>(
  Component: FunctionComponent<T>
): FunctionComponent<T> =>
  function (this: any, props: T, context?: any) {
    const errorManager = useErrorManager();

    try {
      return Component.apply(this, [props, context]);
    } catch (err) {
      if (!errorManager) {
        throw err;
      }

      errorManager.report(err);
      return <></>;
    }
  };

const wrapComponent = <T extends any = {}>(
  Component: ComponentType<T>
): ComponentType<T> => {
  if (WrapComponentTable.has(Component)) {
    return WrapComponentTable.get(Component);
  }

  let WrappedComponent: ComponentType<T>;
  if (Component.prototype.render) {
    WrappedComponent = wrapComponentClass<T>(Component as ComponentClass<T>);
  } else {
    WrappedComponent = wrapFunctionComponent<T>(
      Component as FunctionComponent<T>
    );
  }
  WrapComponentTable.set(Component, WrappedComponent);
  return WrappedComponent;
};

const PatchReactTable = new WeakMap();

export class ReactErrors extends Error {
  readonly errors: any[] = [];

  constructor(errors: any[]) {
    super(
      errors
        .map((error, i) =>
          errors.length === 1 ? `${error}` : `${i}: ${error}`
        )
        .join('\n')
    );
    this.errors = errors;
    this.stack = errors
      .map((error, i) => {
        if (error instanceof Error) {
          if (errors.length === 1) {
            return error.stack;
          } else {
            return error.stack?.replace(/^Error:/, `Error ${i}:`);
          }
        }

        return undefined;
      })
      .filter(x => !!x)
      .join('\n\n');
  }
}

export class ErrorManager {
  readonly errors: any[] = [];

  constructor() {
    //ErrorManager.patch(React);
  }

  report(error: any) {
    this.errors.push(error);
  }

  throwIfErrors() {
    if (this.errors.length) {
      throw new ReactErrors(this.errors);
    }
  }

  static patch(react: { createElement: typeof React['createElement'] }) {
    if (!PatchReactTable.has(react)) {
      const originalCreateElement = react.createElement;
      const createElement = (type: any, ...args: any[]) => {
        if (typeof type === 'function') {
          return originalCreateElement.call(
            react,
            wrapComponent(type),
            ...args
          );
        }

        return originalCreateElement.call(react, type, ...args);
      };
      PatchReactTable.set(react, true);
      react.createElement = createElement as any;
    }
  }
}
