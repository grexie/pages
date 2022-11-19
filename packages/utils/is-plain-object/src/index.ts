export const isPlainObject = (value: object) => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};
