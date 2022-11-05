import { createResolver, ResolvablePromise } from './resolvable.js';

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
  #current?: Promise<void>;

  get locked() {
    return !!this.#current;
  }

  async lock(fail: boolean = false) {
    const resolver = createResolver();

    if (this.locked && fail) {
      throw new Error('lock fail');
    }

    const promise = this.#current;
    this.#current = resolver;
    resolver.finally(() => {
      if (this.#current === resolver) {
        this.#current = undefined;
      }
    });

    await promise;
    return new Lock(resolver);
  }
}

export class KeyedMutex {
  readonly #globalLock = new Mutex();
  readonly #locks: Record<string, Promise<void>> = {};

  locked(names: string | string[]): boolean {
    if (typeof names === 'string') {
      names = [names];
    }

    return names.reduce((a, name) => a || !!this.#locks[name], false);
  }

  lockedAll(names: string[]): boolean {
    return names.reduce((a, name) => a && !!this.#locks[name], true);
  }

  lockedNot(names: string[]): string[] {
    return names.filter(name => !this.#locks[name]);
  }

  lockedOnly(names: string[]): string[] {
    return names.filter(name => !!this.#locks[name]);
  }

  async lockGlobal(fail: boolean = false) {
    const lock = await this.#globalLock.lock(fail);
    await Promise.all(Object.values(this.#locks));
    return lock;
  }

  async lock(names: string | string[], fail: boolean = false) {
    const global = await this.#globalLock.lock(fail);
    if (typeof names === 'string') {
      names = [names];
    }

    if (fail && this.locked(names)) {
      throw new Error('lock fail');
    }

    const resolver = createResolver();

    const promises = names.map(name => {
      const promise = this.#locks[name];
      this.#locks[name] = resolver;
      return promise;
    });

    resolver.finally(() => {
      (names as string[]).forEach(name => {
        if (this.#locks[name] === resolver) {
          delete this.#locks[name];
        }
      });
    });

    global.unlock();
    await Promise.all(promises);
    return new Lock(resolver);
  }
}
