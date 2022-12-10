import type { MergerOptions, Merger } from './Merger.js';

export const SchemaSymbol = Symbol('Schema');

export type WithSchema<T extends Object> = T & { [SchemaSymbol]: Schema };

export abstract class Schema<
  T = any,
  O extends MergerOptions<T> = MergerOptions<T>
> {
  protected readonly merger;

  protected constructor(merger: Merger<T, O>) {
    this.merger = merger;
  }

  toObject(): any {
    return {};
  }

  abstract merge(current: T | undefined, next: any): T | undefined;
}
