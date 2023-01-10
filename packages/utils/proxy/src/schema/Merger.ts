export interface MergerOptions<T, C = any> {
  merge: (current: T | undefined, next: any) => T | undefined;
  current: T | undefined;
  next: any;
  context: C;
}

export type Merger<T, O extends MergerOptions<T> = MergerOptions<T>> = (
  options: O
) => T | undefined;
