export interface MergerOptions<T> {
  merge: (current: T | undefined, next: any) => T | undefined;
  current: T | undefined;
  next: any;
}

export type Merger<T, O extends MergerOptions<T> = MergerOptions<T>> = (
  options: O
) => T | undefined;
