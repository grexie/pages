export interface ResolvablePromise<T = void>
  extends Required<Resolver<T>>,
    Promise<T> {}

export interface Resolver<T = void> {
  readonly resolved: boolean;
  readonly resolve: (value: T) => void;
  readonly reject: (error: any) => void;
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
      reject: (err: any) => {
        resolved = true;
        reject(err);
      },
    });
  });
  Object.assign(promise, resolver);
  return promise as unknown as ResolvablePromise<T>;
};

export class PromiseQueue implements PromiseLike<void> {
  readonly #promises: Promise<any>[] = [];

  async add(promise: Promise<any>) {
    const previousPromises = [...this.#promises];

    this.#promises.push(promise);
    console.info('awaiting', previousPromises.length, 'promises');
    await Promise.all(previousPromises);
  }

  then<TResult1 = void, TResult2 = never>(
    onfulfilled?:
      | ((value: void) => TResult1 | PromiseLike<TResult1>)
      | null
      | undefined,
    onrejected?:
      | ((reason: any) => TResult2 | PromiseLike<TResult2>)
      | null
      | undefined
  ): Promise<TResult1 | TResult2> {
    const length = this.#promises.length;
    return Promise.all(this.#promises)
      .then(async () => {
        await new Promise(resolve => setImmediate(resolve));

        if (length === this.#promises.length) {
          return;
        } else {
          return this as PromiseLike<void>;
        }
      })
      .then(onfulfilled, onrejected);
  }

  catch<TResult = never>(
    onrejected?:
      | ((reason: any) => TResult | PromiseLike<TResult>)
      | null
      | undefined
  ): Promise<void | TResult> {
    return this.then(x => x, onrejected);
  }

  finally(onfinally?: (() => void) | null | undefined): Promise<void> {
    return this.then(x => x).finally(onfinally);
  }
}
