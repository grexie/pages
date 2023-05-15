import { Metadata } from './Metadata.js';
export const wrapMetadata = metadata => {
  return (context, parent) => {
    let _metadata = metadata;
    if (typeof _metadata === 'function') {
      _metadata = _metadata(context);
    }
    const proxy = new Metadata(_metadata, parent);
    Metadata.setContext(proxy, context);
    return proxy;
  };
};
//# sourceMappingURL=index.js.map