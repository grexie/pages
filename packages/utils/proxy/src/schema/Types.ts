export enum IntrinsicType {
  boolean = 'boolean',
  number = 'number',
  string = 'string',
  array = 'array',
  object = 'object',
}

export type Intrinsic = null | boolean | number | string | Object | Array;

export type Object<K extends string | symbol | number = any> = {
  [P in K]: Intrinsic;
};

export type Array = Intrinsic[];
