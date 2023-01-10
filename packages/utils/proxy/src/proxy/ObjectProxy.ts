import { SchemaSymbol } from '../schema/Schema.js';

const Private = {};
const ProxyTable = new WeakMap<any, ObjectProxy>();
const ProxyTargetTable = new WeakMap<any, ProxiedObject<any>>();

export type ProxiedObject<
  T extends Record<string | symbol | number, any> = Record<
    string | symbol | number,
    any
  >
> = T & {
  toJSON(): any;
};

export class ObjectProxy<
  T extends Record<string | symbol | number, any> = Record<
    string | symbol | number,
    any
  >
> implements ProxyHandler<T>
{
  readonly parent?: T;
  readonly root: T;
  #instance?: T;

  readonly path: (string | symbol | number)[];

  private constructor(
    root: T,
    parent?: T,
    path?: (string | symbol | number)[],
    _?: any
  ) {
    if (_ !== Private) {
      throw new TypeError('not a constructor');
    }
    this.root = root;
    this.parent = parent;
    this.path = path ?? [];
  }

  get parentProxy(): ObjectProxy<T> | undefined {
    if (this.parent) {
      return ProxyTable.get(this.parent) as ObjectProxy<T>;
    }
  }

  static #create<T extends Record<string, any> = any>(
    root: Record<string, any>,
    parent?: Record<string, any>,
    target: Record<string, any> = root,
    path: (string | symbol | number)[] = []
  ): ProxiedObject<T> {
    const proxy = new ObjectProxy(root, parent, path, Private);
    const instance = new Proxy(target, proxy);
    ProxyTargetTable.set(target, instance);
    proxy.#instance = instance;
    ProxyTable.set(instance, proxy);
    return instance as ProxiedObject<T>;
  }

  static create<T extends Record<string, any> = Record<string, any>>(
    target: Record<string, any>,
    parent?: Record<string, any>
  ): ProxiedObject<T> {
    return this.#create(target, parent);
  }

  static get<T extends Record<string, any> = any>(
    instance: ProxiedObject<T>
  ): T {
    if (!ProxyTable.has(instance)) {
      return instance;
    }

    const proxy = ProxyTable.get(instance)!;
    let el: any = proxy.root;
    for (const c of proxy.path) {
      el = el?.[c];
    }
    return el;
  }

  static getObjectProxy<T extends Record<string, any> = any>(
    instance: ProxiedObject<T>
  ): ObjectProxy<T> | undefined {
    return ProxyTable.get(instance);
  }

  static getFromTarget<T extends Record<string, any> = any>(
    target: T
  ): ProxiedObject<T> {
    return ProxyTargetTable.get(target);
  }

  toJSON() {
    const out: any = {};
    const stack = [{ out, instance: this.#instance }];
    let el: typeof stack[0] | undefined;
    while ((el = stack.shift())) {
      const { out, instance } = el;
      for (const k of Reflect.ownKeys(el.instance!)) {
        const value = el.instance![k];
        if (
          typeof value === 'object' &&
          !Array.isArray(value) &&
          value !== null
        ) {
          out[k] = Object.assign({}, value);

          if (
            typeof out[k] === 'object' &&
            out[k] !== null &&
            !Array.isArray(out[k])
          ) {
            stack.push({ out: out[k], instance: value });
          }
          continue;
        } else if (Array.isArray(value)) {
          out[k] = value.slice();

          (out[k] as any[]).forEach((out, i) => {
            if (
              typeof out[k] === 'object' &&
              out[k] !== null &&
              !Array.isArray(out[k])
            ) {
              stack.push({ out, instance: value[i] });
            }
          });
          continue;
        }

        if (typeof value !== 'undefined') {
          out[k] = value;
        }
      }
    }

    return out;
  }

  descriptor(p: string | symbol | number) {
    let proxy: ObjectProxy<T> | undefined = this;
    let target: any;
    do {
      target = proxy.root;
      for (const c of proxy.path) {
        target = target[c];
        if (
          typeof target !== 'object' ||
          Array.isArray(target) ||
          target === null
        ) {
          break;
        }
      }
      if (
        typeof target !== 'object' ||
        Array.isArray(target) ||
        target === null
      ) {
        continue;
      }
      if (p in target) {
        if (Reflect.getOwnPropertyDescriptor(target, p)?.get) {
          break;
        }
      }
    } while ((proxy = proxy.parentProxy));

    if (p in target) {
      const descriptor = Reflect.getOwnPropertyDescriptor(target, p);
      if (descriptor) {
        return descriptor;
      }
    }

    return {
      configurable: true,
      enumerable: true,
      get(this: any) {
        return Reflect.get(this, p);
      },
      set(value: any) {
        Reflect.set(this, p, value);
      },
    };
  }

  get(_: T, p: string | symbol | number) {
    if (p === 'toJSON') {
      return this.toJSON.bind(this);
    }

    let o: any = this.root;
    const path = [...this.path, p];

    let complete = true;
    for (const c of this.path) {
      o = o?.[c];
      if (typeof o === 'undefined') {
        complete = false;
        break;
      }
    }

    if (complete) {
      const getter = this.descriptor(p)?.get;
      if (typeof getter === 'function') {
        o = getter.call(o);
      } else {
        o = o[p];
      }
    }

    if (typeof o === 'undefined') {
      o = this.parent && Reflect.get(this.parent, p);
    }

    if (
      [SchemaSymbol].includes(p as any) &&
      typeof o === 'object' &&
      !Array.isArray(o) &&
      o !== null
    ) {
      const instance = ObjectProxy.#create(
        this.root,
        this.parent?.[p],
        o,
        path
      );
      return instance;
    }

    return o;
  }

  set(_: T, p: string | symbol | number, value: any) {
    let tel = this.root as any;
    let merge: [string | symbol | number, any, any] | undefined;

    for (const c of this.path) {
      if (
        typeof tel[c] !== 'object' ||
        Array.isArray(tel[c]) ||
        tel[c] === null
      ) {
        if (!merge) {
          merge = [c, tel, {}];
          tel = merge[2];
        } else {
          tel[c] = {};
          tel = tel[c];
        }
      } else {
        tel = tel[c];
      }
    }

    const setter = this.descriptor(p)?.set;
    if (setter) {
      setter.call(tel, value);
    } else {
      tel[p] = value;
    }

    if (merge) {
      const [p, o, n] = merge;
      Reflect.set(o, p, n);
    }

    return true;
  }

  deleteProperty(_: T, p: string | symbol | number) {
    let stack: any[] = [];
    let tel = this.root as any;

    for (const c of [...this.path, p]) {
      if (typeof tel !== 'object' || Array.isArray(tel) || tel === null) {
        return true;
      }

      stack.push({ o: tel, p: c });
      tel = tel[c];
    }

    let el: any;
    while ((el = stack.pop())) {
      delete el.o[el.p];
      if (Object.keys(el.o).length !== 0) {
        break;
      }
    }
    return true;
  }

  isExtensible() {
    return true;
  }

  ownKeys(_: T) {
    let proxy: ObjectProxy<T> | undefined = this;
    const stack: any[] = [];
    do {
      let target = proxy.root;
      for (const c of proxy.path) {
        target = target[c];
        if (
          typeof target !== 'object' ||
          Array.isArray(target) ||
          target === null
        ) {
          break;
        }
      }
      if (
        typeof target !== 'object' ||
        Array.isArray(target) ||
        target === null
      ) {
        continue;
      }
      stack.push(target);
    } while ((proxy = proxy.parentProxy));

    const keys: (string | symbol)[] = stack.reduce(
      (a, b) =>
        Array.from(
          new Set([
            ...a,
            ...Object.getOwnPropertyNames(b).filter(
              name => Reflect.getOwnPropertyDescriptor(b, name)?.enumerable
            ),
            ...Object.getOwnPropertySymbols(b).filter(
              symbol => Reflect.getOwnPropertyDescriptor(b, symbol)?.enumerable
            ),
          ])
        ),
      []
    );

    return keys;
  }

  hasKey(_: T, p: string | symbol | number) {
    let proxy: ObjectProxy<T> | undefined = this;
    do {
      let target = proxy.root;
      for (const c of proxy.path) {
        target = target[c];
        if (
          typeof target !== 'object' ||
          Array.isArray(target) ||
          target === null
        ) {
          break;
        }
      }
      if (
        typeof target !== 'object' ||
        Array.isArray(target) ||
        target === null
      ) {
        continue;
      }
      if (p in target) {
        if (Reflect.getOwnPropertyDescriptor(target, p)?.enumerable) {
          return true;
        }
      }
    } while ((proxy = proxy.parentProxy));
    return false;
  }

  getOwnPropertyDescriptor(target: T, p: string | symbol | number) {
    if (this.hasKey(target, p)) {
      return this.descriptor(p);
    }
  }
}
