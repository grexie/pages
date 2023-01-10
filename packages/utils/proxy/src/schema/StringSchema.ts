import type { Merger, MergerOptions } from './Merger.js';
import { Schema } from './Schema.js';

export class StringSchema extends Schema<string> {
  constructor(
    merger: Merger<string> = ({ merge, current, next }) => merge(current, next)
  ) {
    super(merger);
  }

  merge(self: any, context: any, current: string, next: any) {
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
