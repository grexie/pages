import type { Merger, MergerOptions } from './Merger.js';
import { SchemaSymbol, WithSchema, Schema } from './Schema.js';
import type { Object, Array } from './Types.js';
import { BooleanSchema } from './BooleanSchema.js';
import { NumberSchema } from './NumberSchema.js';
import { StringSchema } from './StringSchema.js';
import { ArraySchema, ArrayMerger } from './ArraySchema.js';

export interface ObjectMergerOptions<T> extends MergerOptions<T> {}

export type ObjectMerger<T> = Merger<T, ObjectMergerOptions<T>>;

export class ObjectSchema<
  T extends Object = any,
  K extends keyof T = keyof T
> extends Schema<T, ObjectMergerOptions<T>> {
  readonly members: Partial<Record<K, Schema>> = {};

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
  set<T, TK extends string, M extends Merger<T>, S extends Schema<T>>(
    type: TK,
    key: K,
    merger?: M
  ): S {
    let schema: any;
    switch (type) {
      case 'object': {
        schema = new ObjectSchema<any>(merger);
        break;
      }
      case 'array': {
        schema = new ArraySchema<any>(merger);
        break;
      }
      case 'string': {
        schema = new StringSchema(merger as any) as any;
        break;
      }
      case 'number': {
        schema = new NumberSchema(merger as any) as any;
        break;
      }
      case 'boolean': {
        schema = new BooleanSchema(merger as any) as any;
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

  create(initial?: T): WithSchema<T> {
    const object = {} as WithSchema<T>;
    const members = Object.entries(this.members) as [K, Schema][];

    members.forEach(([member, schema]) => {
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
            const merged = schema.merge(previousValueTable.get(this), value);
            mergedTable.set(this, merged);
            previousValueTable.set(this, valueTable.get(this));
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

    Object.defineProperty(object, SchemaSymbol, {
      configurable: true,
      enumerable: false,
      get: () => {
        return this;
      },
    });

    return object;
  }

  merge(current: T, next: any) {
    return this.create(
      this.merger({
        merge: (current, next) => {
          if (typeof next === 'undefined') {
            return;
          }

          if (typeof next !== 'object' || Array.isArray(next)) {
            return;
          }

          return next;
        },
        current,
        next,
      })
    );
  }
}
