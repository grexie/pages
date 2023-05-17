export const name = <T extends Function>(
  name: string,
  fn: T
): T & { displayName: string } => {
  Object.defineProperty(fn, 'name', { value: name });
  Object.defineProperty(fn, 'displayName', { value: name });
  return fn as any;
};
