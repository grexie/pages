import type { Merger, MergerOptions } from './Merger.js';
import { Schema } from './Schema.js';

export class StringSchema extends Schema<string> {
  constructor(merger: Merger<string> = ({ next }) => String(next).toString()) {
    super(merger);
  }

  merge(context: any, current: string, next: any) {
    return this.merger({
      merge: (current, next) => {
        return next;
      },
      current,
      next,
      context,
    });
  }
}
