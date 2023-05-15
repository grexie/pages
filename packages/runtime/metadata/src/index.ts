import { Metadata, MetadataContext } from './Metadata.js';

export const wrapMetadata = (metadata: (() => any) | any) => {
  return (context: MetadataContext, parent?: Metadata) => {
    let _metadata = metadata;
    if (typeof _metadata === 'function') {
      _metadata = _metadata(context);
    }

    const proxy = new Metadata(_metadata, parent);
    Metadata.setContext(proxy, context);
    return proxy;
  };
};
