import { lazy, Attributes, PropsWithRef, FC } from 'react';
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

const context = new LazyContext();

export const withLazyBase = (
  cb: (<P extends Object = {}>() => Promise<FC<P> | null | undefined>)[]
) => {
  const Components = cb.map(cb => {
    const Component = lazy(async () => {
      await new Promise(resolve => setImmediate(resolve));

      const Component = await cb();

      if (!Component) {
        return { default: () => null } as any;
      } else if (typeof Component === 'object') {
        return Component;
      } else {
        return { default: Component };
      }
    });

    return (props: Attributes & PropsWithRef<any>) => <Component {...props} />;
  });

  return Components;
};

export const withLazy = <P extends Object = {}>(
  cb: () => Promise<FC<P> | null | undefined>
) => {
  return withLazyBase([async () => context.wrap(cb() as Promise<any>)])[0];
};

export const withLazyComplete = <P extends Object = {}>(
  cb: () => Promise<FC<P> | null | undefined>
) => {
  return withLazyBase([
    async () => context.complete(cb as () => Promise<any>),
  ])[0];
};

export const withManyLazy = (
  cb: (<P extends Object = {}>() => Promise<FC<P> | null | undefined>)[]
) => {
  return withLazyBase(
    cb.map(cb => () => context.wrap(cb() as Promise<any>))
  )[0];
};
