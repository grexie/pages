import { createResolver, ResolvablePromise } from './resolvable';

export class Lock {
  readonly #resolver: ResolvablePromise<void>;

  constructor(resolver: ResolvablePromise<void>) {
    this.#resolver = resolver;
  }

  unlock() {
    this.#resolver.resolve();
  }
}

export class Mutex {
  #current = Promise.resolve();

  async lock() {
    const resolver = createResolver();

    const promise = this.#current;
    this.#current = resolver;
    try {
      await promise;
    } catch (err) {}

    return new Lock(resolver);
  }
}
