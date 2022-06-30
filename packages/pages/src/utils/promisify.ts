import { promisify as _promisify } from 'util';

const FunctionTable = new WeakMap<Function, WeakMap<any, Function>>();

export const promisify = (self: any, fn: Function) => {
  if (!FunctionTable.has(fn)) {
    FunctionTable.set(fn, new WeakMap());
  }
  const cache = FunctionTable.get(fn)!;

  if (!cache.has(self)) {
    const pf = _promisify((fn as any).bind(self));
    cache.set(self, pf as any);
  }

  return cache.get(self) as any;
};
