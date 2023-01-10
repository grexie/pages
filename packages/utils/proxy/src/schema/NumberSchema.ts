import type { Merger } from './Merger.js';
import { Schema } from './Schema.js';

export class NumberSchema extends Schema<number> {
  constructor(merger: Merger<number> = ({ next }) => Number(next)) {
    super(merger);
  }

  merge(self: any, context: any, current: number, next: any) {
    return this.merger.call(self, {
      merge: (current, next) => {
        return next;
      },
      current,
      next,
      context,
    });
  }
}
