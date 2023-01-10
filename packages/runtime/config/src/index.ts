import { Config, ConfigContext } from '@grexie/pages';
import { ObjectProxy, SchemaSymbol } from '@grexie/proxy';

export const wrapConfig = (config: (() => any) | any) => {
  return (context?: ConfigContext, parent?: Config) => {
    let _config = config;
    if (typeof _config === 'function') {
      _config = _config(context);
    }

    (parent as any)?.[SchemaSymbol].setContext(_config, context);
    const proxy = ObjectProxy.create<Config>(_config, parent);
    return proxy;
  };
};
