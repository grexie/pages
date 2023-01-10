import type { Merger, MergerOptions } from './Merger.js';
import { SchemaSymbol, WithSchema, Schema } from './Schema.js';
import type { Object, Array } from './Types.js';
import { BooleanSchema } from './BooleanSchema.js';
import { NumberSchema } from './NumberSchema.js';
import { StringSchema } from './StringSchema.js';
import { ArraySchema, ArrayMerger } from './ArraySchema.js';
import { EnumSchema } from './EnumSchema.js';
import { ObjectProxy } from '../proxy/ObjectProxy.js';

export interface ObjectMergerOptions<T> extends MergerOptions<T> {}

export type ObjectMerger<T> = Merger<T, ObjectMergerOptions<T>>;

export class ObjectSchema<
  T extends object = any,
  K extends keyof T = keyof T
> extends Schema<T, ObjectMergerOptions<T>> {
  readonly members: Partial<Record<K, Schema>> = {};
  readonly #contextTable = new WeakMap();

  constructor(merger?: ObjectMerger<T>) {
    if (!merger) {
      merger = ({ merge, current, next }) => merge(current, next);
    }

    super(merger);
  }

  set<T extends boolean>(
    type: 'boolean',
    key: K,
    merger?: Merger<boolean>
  ): BooleanSchema;
  set<T extends number>(
    type: 'number',
    key: K,
    merger?: Merger<number>
  ): NumberSchema;
  set<T extends string>(
    type: 'string',
    key: K,
    merger?: Merger<string>
  ): StringSchema;
  set<T extends Object>(
    type: 'object',
    key: K,
    merger?: ObjectMerger<T>
  ): ObjectSchema<T>;
  set<T extends Array>(
    type: 'array',
    key: K,
    merger?: ArrayMerger<T>
  ): ArraySchema<T>;
  set<T>(
    type: 'enum',
    key: K,
    values: T[],
    merger?: Merger<string>
  ): EnumSchema<T>;
  set<T, TK extends string, S extends Schema<T>>(
    type: TK,
    key: K,
    ...args: any[]
  ): S {
    let schema: any;
    switch (type) {
      case 'object': {
        schema = new ObjectSchema<any>(args[0]);
        break;
      }
      case 'array': {
        schema = new ArraySchema<any>(args[0]);
        break;
      }
      case 'string': {
        schema = new StringSchema(args[0]);
        break;
      }
      case 'number': {
        schema = new NumberSchema(args[0]);
        break;
      }
      case 'boolean': {
        schema = new BooleanSchema(args[0]);
        break;
      }
      case 'enum': {
        schema = new EnumSchema(args[1], args[0]);
        break;
      }
      default: {
        throw new Error(`type ${type} is not an intrinsic schema type`);
      }
    }
    this.members[key] = schema;
    return schema;
  }

  toObject(): any {
    return {
      ...super.toObject(),
      members: Object.entries(this.members).reduce(
        (a: any, [key, schema]: any[]) => ({
          ...a,
          [key]: schema.toObject(),
        }),
        {}
      ),
    };
  }

  setContext = (object: any, context: any) => {
    this.#contextTable.set(object, context);
    return object;
  };

  create(context: any, initial?: T): WithSchema<T> {
    const object = {} as WithSchema<T>;
    this.setContext(object, context);
    const members = Object.entries(this.members) as [K, Schema][];
    const self = this;

    const otherFields = new Set<string | symbol | number>(
      initial ? Reflect.ownKeys(initial) : []
    );

    members.forEach(([member, schema]) => {
      otherFields.delete(member);
      const previousValueTable = new WeakMap<any, any>();
      const valueTable = new WeakMap<any, any>();
      const mergedTable = new WeakMap<any, any>();

      valueTable.set(object, initial?.[member]);

      Object.defineProperty(object, member, {
        configurable: true,
        enumerable: true,
        get() {
          if (!mergedTable.has(this)) {
            const value =
              this === object
                ? valueTable.get(this)
                : Reflect.get(this, member);
            const mergeSelf = ObjectProxy.getFromTarget(this);
            const context = self.#contextTable.get(this);
            const merged = schema.merge(
              mergeSelf,
              context,
              previousValueTable.get(this),
              value
            );
            mergedTable.set(this, merged);
            previousValueTable.set(this, value);
            valueTable.delete(this);
          }

          return mergedTable.get(this);
        },
        set(value: any) {
          mergedTable.delete(this);
          if (this !== object) {
            Reflect.set(this, member, value);
          } else {
            valueTable.set(this, value);
          }
        },
      });
    });

    for (const key of otherFields) {
      (object as any)[key] = (initial as any)[key];
    }

    Object.defineProperty(object, SchemaSymbol, {
      configurable: true,
      enumerable: false,
      get: () => {
        return this;
      },
    });

    return object;
  }

  merge(self: any, context: any, current: T, next: any) {
    return this.merger.call(self, {
      merge: (current, next) => {
        if (typeof next === 'undefined') {
          return;
        }

        if (typeof next !== 'object' || Array.isArray(next)) {
          return;
        }

        for (const member in this.members) {
          next[member] = this.members[member]?.merge(
            self,
            context,
            current,
            next
          );
        }

        return next;
      },
      current,
      next,
      context,
    });
  }
}
