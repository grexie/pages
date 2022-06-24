import React, {
  lazy,
  Attributes,
  PropsWithRef,
  DependencyList,
  FC,
  useMemo,
} from 'react';
import { createContextWithProps } from '../utils/context';

interface ErrorManager {
  report: (error: any) => void;
}

class LazyContext {
  readonly #wrapped: Promise<any>[] = [];
  readonly errorManager?: ErrorManager;

  constructor(errorManager?: ErrorManager) {
    this.errorManager = errorManager;
  }

  async wrap<T extends unknown>(promise: Promise<T>): Promise<T> {
    promise = promise.finally(() => {
      const index = this.#wrapped.indexOf(promise);
      if (index !== -1) {
        this.#wrapped.splice(index, 1);
      }
    });
    this.#wrapped.push(promise);
    return promise;
  }

  async complete<T extends unknown>(promise: Promise<T> | T): Promise<T> {
    const next = async (): Promise<void> => {
      await new Promise(resolve => setImmediate(resolve));

      if (this.#wrapped.length) {
        await Promise.all(this.#wrapped);
        return next();
      }
    };

    await next();

    return promise;
  }
}

export const {
  Provider: LazyProvider,
  with: withLazy,
  use: useLazyContext,
} = createContextWithProps<LazyContext, { errorManager?: ErrorManager }>(
  Provider =>
    ({ errorManager, children }) => {
      const context = useMemo(
        () => new LazyContext(errorManager),
        [errorManager]
      );
      return <Provider value={context}>{children}</Provider>;
    }
);

export const useLazyBase = (
  cb: (<P extends Object = {}>() => Promise<FC<P> | null | undefined>)[],
  dependencies: DependencyList | undefined
) => {
  const { errorManager } = useLazyContext();

  const Components = useMemo(() => {
    return cb.map(cb => {
      const Component = lazy(async () => {
        try {
          const Component = await cb();

          if (!Component) {
            return { default: () => <></> } as any;
          } else if (typeof Component === 'object') {
            return Component;
          } else {
            return { default: Component };
          }
        } catch (err) {
          if (!errorManager) {
            throw err;
          }

          errorManager.report(err);
          return { default: () => <></> };
        }
      });

      return (props: Attributes & PropsWithRef<any>) => <Component {...props} />;
    });
  }, dependencies);

  return Components;
};

export const useLazy = <P extends Object = {}>(
  cb: () => Promise<FC<P> | null | undefined>,
  dependencies: DependencyList | undefined
) => {
  const context = useLazyContext();

  return useLazyBase([async () => context.wrap(cb() as Promise<any>)], dependencies)[0];
};

export const useLazyComplete = <P extends Object = {}>(
  cb: () => Promise<FC<P> | null | undefined>,
  dependencies: DependencyList | undefined
) => {
  const context = useLazyContext();

  return useLazyBase([async () => context.complete(cb() as Promise<any>) ], dependencies)[0];
};

export const useManyLazy = (
  cb: (<P extends Object = {}>() => Promise<FC<P> | null | undefined>)[],
  dependencies: DependencyList | undefined
) => {
  const context = useLazyContext();

  return useLazyBase(
    cb.map(cb => () => context.wrap(cb() as Promise<any>)),
    dependencies
  )[0];
};

