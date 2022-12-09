import { Config } from '@grexie/pages';
import { ObjectProxy } from '@grexie/proxy';

export const wrapConfig = (config: (() => any) | any) => {
  if (typeof config === 'function') {
    config = config();
  }

  return (parent?: Config) => {
    const proxy = ObjectProxy.create<Config>(config, parent);
    return proxy;
  };
};
