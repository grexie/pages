import type { Merger } from './Merger.js';
import { Schema } from './Schema.js';

export class BooleanSchema extends Schema<boolean> {
  constructor(
    merger: Merger<boolean> = ({ merge, current, next }) => merge(current, next)
  ) {
    super(merger);
  }

  merge(current: boolean, next: any) {
    return this.merger({
      merge: (current, next) => {
        if (typeof next === 'undefined') {
          return next;
        }

        return !!Boolean(next);
      },
      current,
      next,
    });
  }
}
