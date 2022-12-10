import type { Merger } from './Merger.js';
import { Schema } from './Schema.js';

export class NumberSchema extends Schema<number> {
  constructor(merger: Merger<number> = ({ next }) => Number(next)) {
    super(merger);
  }

  merge(current: number, next: any) {
    return this.merger({
      merge: (current, next) => {
        return next;
      },
      current,
      next,
    });
  }
}
