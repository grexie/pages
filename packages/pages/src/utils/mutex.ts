import { createResolver, ResolvablePromise } from './resolvable.js';

export class Lock {
  readonly #resolver: ResolvablePromise<void>;
  #locked: boolean = true;

  constructor(resolver: ResolvablePromise<void>) {
    this.#resolver = resolver;
  }

  get locked() {
    return this.#locked;
  }

  unlock() {
    if (this.#locked) {
      this.#locked = false;
      this.#resolver.resolve();
    }
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
  readonly #watcher: boolean;
  #interval?: NodeJS.Timer;

  constructor({ watcher = false }: { watcher?: boolean } = {}) {
    this.#watcher = watcher;
  }

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

  get lockedGlobal() {
    return this.#globalLock.locked;
  }

  async lockGlobal(fail: boolean = false) {
    const lock = await this.#globalLock.lock(fail);
    await Promise.all(Object.values(this.#locks));
    return lock;
  }

  #startWatcher() {
    if (!this.#interval) {
      this.#interval = setInterval(() => {
        const locked = Object.keys(this.#locks);
        if (this.#globalLock.locked) {
          locked.push('global');
        }
        locked.forEach(name => console.info('still locked', name));
      }, 1000);
    }
  }

  #endWatcherIfFinished() {
    if (!this.#interval) {
      return;
    }

    if (Object.keys(this.#locks).length === 0) {
      clearInterval(this.#interval);
      this.#interval = undefined;
    }
  }

  async lockAsync<T>(
    names: string | string[],
    cb: () => Promise<T>,
    fail: boolean = false
  ) {
    const lock = await this.lock(names, fail);

    try {
      await cb();
    } finally {
      lock.unlock();
    }
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

    this.#startWatcher();

    resolver.finally(() => {
      (names as string[]).forEach(name => {
        if (this.#locks[name] === resolver) {
          delete this.#locks[name];
        }
        this.#endWatcherIfFinished();
      });
    });

    global.unlock();
    await Promise.all(promises);
    return new Lock(resolver);
  }
}
