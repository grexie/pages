const TimedTable = new WeakMap<Function, Timed<any>>();

class Timed<F extends Function> {
  readonly target: F;
  total: number = 0;
  count: number = 0;

  constructor(target: F) {
    this.target = target;
  }

  static get(target: Function): Timed<any> {
    if (!TimedTable.has(target)) {
      TimedTable.set(target, new Timed(target));
    }
    return TimedTable.get(target)!;
  }

  start() {
    const startTime = performance.now();
    return () => {
      const endTime = performance.now();
      const elapsedTime = endTime - startTime;
      this.total += elapsedTime;
      this.count++;
    };
  }

  reset() {
    this.count = 0;
    this.total = 0;
    return this.target;
  }

  log(...message: any[]) {
    console.info(
      ...message,
      'count',
      this.count,
      'total',
      `${(this.total / 1000).toFixed(0)}s`,
      'average',
      `${(this.count ? this.total / this.count : 0).toFixed(3)}ms`
    );
    return this.target;
  }

  logInterval(ms: number, ...message: any[]) {
    return setInterval(() => {
      this.log(...message);
    }, ms);
  }
}

export type TimedFunction<F extends Function> = F & { timed: Timed<F> };

export const timed = <F extends Function>(fn: F): TimedFunction<F> => {
  const timed = Timed.get(fn);

  const handler = function (this: any) {
    const args = [...arguments];

    const stop = timed.start();
    try {
      return fn.apply(this, args);
    } finally {
      stop();
    }
  };

  [
    ...Object.getOwnPropertyNames(fn),
    ...Object.getOwnPropertySymbols(fn),
  ].forEach(key =>
    Object.defineProperty(
      handler,
      key,
      Object.getOwnPropertyDescriptor(fn, key)!
    )
  );

  Object.defineProperty(handler, 'timed', {
    configurable: true,
    enumerable: false,
    value: timed,
  });

  return handler as unknown as TimedFunction<F>;
};

export const timedAsync = <F extends Function>(
  fn: Function
): TimedFunction<F> => {
  const timed = Timed.get(fn);

  const handler = async function (this: any) {
    const args = [...arguments];

    const stop = timed.start();
    try {
      return await fn.apply(this, args);
    } finally {
      stop();
    }
  };

  [
    ...Object.getOwnPropertyNames(fn),
    ...Object.getOwnPropertySymbols(fn),
  ].forEach(key =>
    Object.defineProperty(
      handler,
      key,
      Object.getOwnPropertyDescriptor(fn, key)!
    )
  );

  Object.defineProperty(handler, 'timed', {
    configurable: true,
    enumerable: false,
    value: timed,
  });

  return handler as unknown as TimedFunction<F>;
};
