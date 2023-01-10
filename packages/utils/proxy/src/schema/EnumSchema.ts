import type { Merger } from './Merger.js';
import { Schema } from './Schema.js';

export class EnumSchema<T> extends Schema<T> {
  readonly values: T[];

  constructor(
    merger: Merger<T> = ({ merge, current, next }) => merge(current, next),
    values: T[]
  ) {
    super(merger);
    this.values = values;
  }

  merge(self: any, context: any, current: T, next: any) {
    return this.merger.call(self, {
      merge: (current, next) => {
        if (typeof next === 'undefined') {
          return next;
        }

        if (!this.values.includes(next)) {
          throw new Error(`invalid enum value ${next}`);
        }

        return next;
      },
      current,
      next,
      context,
    });
  }
}
