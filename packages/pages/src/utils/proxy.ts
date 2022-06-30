const Private = {};
const ProxyTable = new WeakMap<any, ObjectProxy>();

export type Object<T extends Record<string, any> = Record<string, any>> = T & {
  toJSON(): any;
};

export class ObjectProxy<T extends Record<string, any> = Record<string, any>>
  implements ProxyHandler<T>
{
  readonly parent?: T;
  readonly root: T;
  readonly path: string[];

  private constructor(root: T, parent?: T, path?: string[], _?: any) {
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
    path: string[] = []
  ): Object<T> {
    const proxy = new ObjectProxy(root, parent, path, Private);
    const instance = new Proxy(target, proxy);
    ProxyTable.set(instance, proxy);
    return instance as Object<T>;
  }

  static create<T extends Record<string, any> = Record<string, any>>(
    target: Record<string, any>,
    parent?: Record<string, any>
  ): Object<T> {
    return this.#create(target, parent);
  }

  static get<T extends Record<string, any> = any>(instance: Object<T>): T {
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

  toJSON() {
    let proxy: ObjectProxy<T> | undefined = this;
    const stack: any[] = [];
    do {
      let root = proxy.root;
      for (const c of this.path) {
        root = root?.[c];
      }
      if (typeof root === 'object' && !Array.isArray(root) && root !== null) {
        stack.unshift(Object.assign({}, root));
      }
    } while ((proxy = proxy.parentProxy));

    const out = {};
    for (const el of stack) {
      const stack = [{ out, el }];
      let item: { out: any; el: any } | undefined;
      while ((item = stack.shift())) {
        const { out, el } = item;

        for (const k of Object.keys(el)) {
          if (
            typeof el[k] === 'object' &&
            el[k] !== null &&
            !Array.isArray(el[k])
          ) {
            el[k] = Object.assign({}, el[k]);

            if (
              typeof out[k] === 'object' &&
              out[k] !== null &&
              !Array.isArray(out[k])
            ) {
              stack.push({ out: out[k], el: el[k] });
              continue;
            }
          }

          out[k] = el[k];
        }
      }
    }
    return out;
  }

  get(_: T, p: Symbol | string) {
    if (typeof p !== 'string') {
      return;
    }

    if (p === 'toJSON') {
      return this.toJSON.bind(this);
    }

    let o: any = this.root;
    const path = [...this.path, p];

    for (const c of path) {
      o = o?.[c];
      if (typeof o === 'undefined') {
        break;
      }
    }

    if (typeof o === 'undefined') {
      o = this.parent?.[p];
    }

    if (typeof o === 'object' && !Array.isArray(o) && o !== null) {
      const parent = this.parent?.[p];
      const instance = ObjectProxy.#create(this.root, parent, o, path);
      return instance;
    }

    return o;
  }

  set(_: T, p: Symbol | string, value: any) {
    if (typeof p !== 'string') {
      return false;
    }

    let tel = this.root as any;

    for (const c of this.path) {
      if (
        typeof tel[c] !== 'object' ||
        Array.isArray(tel[c]) ||
        tel[c] === null
      ) {
        tel[c] = {};
      }

      tel = tel[c];
    }

    tel[p] = value;
    return true;
  }

  deleteProperty(_: T, p: Symbol | string) {
    if (typeof p !== 'string') {
      return true;
    }

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

    const keys: string[] = stack.reduce(
      (a, b) => Array.from(new Set([...a, ...Object.keys(b)])),
      []
    );

    return keys;
  }

  hasKey(_: T, p: symbol | string) {
    if (typeof p !== 'string') {
      return false;
    }

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
        return true;
      }
    } while ((proxy = proxy.parentProxy));
    return false;
  }

  getOwnPropertyDescriptor(target: T, p: symbol | string) {
    if (typeof p !== 'string') {
      return;
    }

    if (this.hasKey(target, p)) {
      return {
        configurable: true,
        enumerable: true,
        get: (): any => this.get(target, p),
        set: (value: any): any => this.set(target, p, value),
      };
    }
  }
}
