import {
  lazy,
  Attributes,
  PropsWithRef,
  DependencyList,
  FC,
  useMemo,
} from 'react';
import { createContext } from '../utils/context.js';
import { setImmediate } from 'timers';

class LazyContext {
  readonly #wrapped: Promise<any>[] = [];

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

  async complete<T extends unknown>(promise: () => Promise<T> | T): Promise<T> {
    const next = async (): Promise<void> => {
      await new Promise(resolve => setImmediate(resolve));
      if (this.#wrapped.length) {
        await Promise.all(this.#wrapped);
        return next();
      }
    };

    await next();

    return promise();
  }
}

export const {
  Provider: LazyProvider,
  with: withLazy,
  use: useLazyContext,
} = createContext<LazyContext>(Provider => ({ children }) => {
  const context = useMemo(() => new LazyContext(), []);
  return <Provider value={context}>{children}</Provider>;
});

export const useLazyBase = (
  cb: (<P extends Object = {}>() => Promise<FC<P> | null | undefined>)[],
  dependencies: DependencyList | undefined
) => {
  const Components = useMemo(() => {
    return cb.map(cb => {
      const Component = lazy(async () => {
        const Component = await cb();

        if (!Component) {
          return { default: () => null } as any;
        } else if (typeof Component === 'object') {
          return Component;
        } else {
          return { default: Component };
        }
      });

      return (props: Attributes & PropsWithRef<any>) => (
        <Component {...props} />
      );
    });
  }, dependencies);

  return Components;
};

export const useLazy = <P extends Object = {}>(
  cb: () => Promise<FC<P> | null | undefined>,
  dependencies: DependencyList | undefined
) => {
  const context = useLazyContext();

  return useLazyBase(
    [async () => context.wrap(cb() as Promise<any>)],
    dependencies
  )[0];
};

export const useLazyComplete = <P extends Object = {}>(
  cb: () => Promise<FC<P> | null | undefined>,
  dependencies: DependencyList | undefined
) => {
  const context = useLazyContext();

  return useLazyBase(
    [async () => context.complete(cb as () => Promise<any>)],
    dependencies
  )[0];
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
