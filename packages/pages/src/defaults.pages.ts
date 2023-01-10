import type { Mapping } from './api/Config.js';
import type { ConfigContext } from './api/Config.js';
import { ObjectSchema } from '@grexie/proxy';
import path from 'path';

export default (context: ConfigContext): any => {
  const ConfigSchema = new ObjectSchema();
  ConfigSchema.set('boolean', 'render');
  ConfigSchema.set<Mapping[]>('array', 'mappings', ({ context, next }) => {
    if (next === null || typeof next === 'undefined') {
      return next;
    }

    if (typeof next === 'string') {
      next = [next];
    }

    if (!Array.isArray(next)) {
      throw new Error('unable to merge mappings, should be an array');
    }

    const parseMapping = (from: string, to: string[] | string) => {
      from = path.resolve(context.dirname, from);
      if (typeof to === 'string') {
        to = to.split(/\//g).filter(x => !!x);
      }
      return { from, to };
    };

    next = next.map(mapping => {
      if (typeof mapping === 'string') {
        const [from, to] = mapping.split(/:/g);
        return parseMapping(from, to);
      } else {
        const [from, to] = mapping;
        return parseMapping(from, to);
      }
    });

    return next;
  });
  ConfigSchema.set('string', 'title');
  ConfigSchema.set<string[]>('array', 'layout');
  ConfigSchema.set('object', 'styles');

  const config = ConfigSchema.create(context, {
    /** @server */
    render: true,

    /** @server */
    mappings: [
      {
        from: (context as any).rootDir,
        to: '/',
      },
    ],

    title: '',
  });
  if (typeof window !== 'undefined') {
    (window as any).defaultConfig = config;
  }

  return config;
};
