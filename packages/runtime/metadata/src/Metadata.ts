const ContextTable = new WeakMap();

export interface MetadataContext {
  filename: string;
}

export interface Metadata {
  [k: string | symbol | number]: any;
}

const stack: (string | symbol)[] = [];

export class Metadata {
  constructor(
    object: any,
    parent?: Metadata,
    root?: Metadata,
    path: (string | symbol | number)[] = []
  ) {
    const self: Metadata = new Proxy(object, {
      get(target, p) {
        const subs = (value: any): any | any[] => {
          if (stack.length) {
            return value;
          }

          if (Array.isArray(value)) {
            return value.map(subs);
          } else if (
            typeof value === 'string' &&
            value.trim().startsWith('${') &&
            value.trim().endsWith('}')
          ) {
            let program = value.trim();
            program = program.substring(2, program.length - 1);
            const keys = Array.from(Reflect.ownKeys(root ?? self)).filter(
              x => typeof x === 'string' && (path.length > 0 || x !== p)
            ) as string[];

            const values = keys.map(k => Reflect.get(root ?? self, k));

            return (
              new Function(...keys, `return (${program});`)(...values) ?? null
            );
          }

          return value;
        };

        let o = object;
        for (let cmp of path) {
          o = o?.[cmp];
        }
        let value = o?.[p];
        stack.push(p);
        const parentValue = parent?.[p];
        stack.pop();

        if (typeof value === 'undefined') {
          if (
            !Array.isArray(parentValue) &&
            typeof parentValue === 'object' &&
            parentValue !== null
          ) {
            return new Metadata(object, parentValue, root ?? self, [
              ...path,
              p,
            ]);
          } else {
            return subs(parentValue);
          }
        } else if (
          !Array.isArray(value) &&
          typeof value === 'object' &&
          value !== null
        ) {
          return new Metadata(object, parentValue, root ?? self, [...path, p]);
        }

        return subs(value);
      },
      set(_, p, newValue) {
        let o = object;
        for (let cmp of path) {
          let n = Reflect.get(o, cmp);
          if (typeof n === 'undefined') {
            n = {};
            o[cmp] = n;
          }
          o = n;
        }

        return Reflect.set(o, p, newValue);
      },
      deleteProperty(_, p) {
        let o = object;
        for (let cmp of path) {
          let n = o[cmp];
          if (typeof n === 'undefined') {
            return false;
          }
          o = n;
        }
        return Reflect.deleteProperty(o, p);
      },
      ownKeys(_) {
        let out = new Set<string | symbol>();
        let o = object;
        for (let cmp of path) {
          o = o?.[cmp];
        }
        if (typeof o === 'object' && o !== null) {
          for (const k of Reflect.ownKeys(o)) {
            out.add(k);
          }
        }
        if (parent) {
          for (const k of Reflect.ownKeys(parent)) {
            out.add(k);
          }
        }
        return [...out].sort();
      },
      getOwnPropertyDescriptor(target, p) {
        let o = object;
        for (let cmp of path) {
          o = o?.[cmp];
        }
        o = o?.[p];
        if (typeof o !== 'undefined') {
          return {
            enumerable: true,
            configurable: true,
            writable: true,
            value: this.get!(target, p, target),
          };
        } else if (parent) {
          return Reflect.getOwnPropertyDescriptor(parent, p);
        }
      },
    });
    return self;
  }

  static getContext(metadata: Metadata) {
    return ContextTable.get(metadata);
  }

  static setContext(metadata: Metadata, context: MetadataContext) {
    ContextTable.set(metadata, context);
  }
}
