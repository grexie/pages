export interface ResolvablePromise<T = void>
  extends Required<Resolver<T>>,
    Promise<T> {}

export interface Resolver<T = void> {
  readonly resolved: boolean;
  readonly resolve: (value: T) => void;
  readonly reject: (error: Error) => void;
}

export const createResolver = <T = void>() => {
  const resolver: Resolver<T> = {} as unknown as Resolver<T>;
  const promise = new Promise<T>((resolve, reject) => {
    let resolved = false;

    Object.assign(resolver, {
      get resolved() {
        return resolved;
      },
      resolve: (value: T) => {
        resolved = true;
        resolve(value);
      },
      reject: (err: Error) => {
        resolved = true;
        reject(err);
      },
    });
  });
  Object.assign(promise, resolver);
  return promise as unknown as ResolvablePromise<T>;
};
