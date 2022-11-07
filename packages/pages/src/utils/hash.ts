import _hash from 'object-hash';

export const hash = (object: any) => {
  return _hash(object, {
    algorithm: 'passthrough',
    ignoreUnknown: true,
  });
};
