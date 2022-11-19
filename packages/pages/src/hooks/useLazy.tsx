import {
  lazy,
  Attributes,
  PropsWithRef,
  FC,
  useMemo,
  Suspense,
  SuspenseProps,
} from 'react';
import { setImmediate } from 'timers';
import { createContext } from '@grexie/context';

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

    const result = await promise();
    return result;
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
  dependencies: any[]
) => {
  return useMemo(
    () =>
      cb.map(cb => {
        const Component = lazy(async () => {
          await new Promise(resolve => setImmediate(resolve));

          const Component = await cb();
          let exports;

          if (!Component) {
            exports = { default: () => null } as any;
          } else if (typeof Component === 'object') {
            exports = Component;
          } else {
            exports = { default: Component };
          }

          return exports;
        });

        return Component;
      }),
    dependencies
  );
};

export const useLazy = <P extends Object = {}>(
  cb: () => Promise<FC<P> | null | undefined>,
  dependencies: any[]
) => {
  const context = useLazyContext();

  return useLazyBase(
    [async () => context.wrap(cb() as Promise<any>)],
    dependencies
  )[0];
};

export const useLazyComplete = <P extends Object = {}>(
  cb: () => Promise<FC<P> | null | undefined>,
  dependencies: any[]
) => {
  const context = useLazyContext();
  const Component = useLazyBase(
    [async () => context.complete(cb as () => Promise<any>)],
    dependencies
  )[0];

  return Component;
};

export const useManyLazy = (
  cb: (<P extends Object = {}>() => Promise<FC<P> | null | undefined>)[],
  dependencies: any[]
) => {
  const context = useLazyContext();

  return useLazyBase(
    cb.map(cb => () => context.wrap(cb() as Promise<any>)),
    dependencies
  )[0];
};

export const ClientSuspense: FC<SuspenseProps> = ({ children, ...props }) => {
  if (typeof window === 'undefined') {
    return <>{children}</>;
  } else {
    return <Suspense {...props}>{children}</Suspense>;
  }
};
