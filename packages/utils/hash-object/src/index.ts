export const hash = (object: any) => {
  const seen = new Set<any>();
  const json = JSON.stringify(object, function (key, value) {
    seen.add(this);
    if (typeof value === 'function') {
      return value.displayName ?? value.name;
    } else if (seen.has(this)) {
      return '#CircularReference';
    }
    return value;
  });
  return json;
};
