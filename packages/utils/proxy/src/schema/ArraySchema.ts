import type { Merger, MergerOptions } from './Merger.js';
import type { Array } from './Types.js';
import { Schema } from './Schema.js';

export interface ArrayMergerOptions<T extends Array> extends MergerOptions<T> {}

export type ArrayMerger<T extends Array> = Merger<T, ArrayMergerOptions<T>>;

export class ArraySchema<T extends Array> extends Schema<
  T,
  ArrayMergerOptions<T>
> {
  constructor(
    merger: ArrayMerger<T> = ({ merge, current, next }) => merge(current, next)
  ) {
    super(merger);
  }

  merge(self: any, context: any, current: T, next: any) {
    return this.merger.call(self, {
      merge: (current, next) => {
        if (typeof next === 'undefined') {
          return;
        }

        if (next === null) {
          return [];
        }

        return next;
      },
      current,
      next,
      context,
    });
  }
}
