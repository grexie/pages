import type { Mapping } from './api/Config.js';
import { ObjectSchema } from '@grexie/proxy';

export default (): any => {
  const ConfigSchema = new ObjectSchema();
  ConfigSchema.set('boolean', 'render');
  ConfigSchema.set<Mapping[]>('array', 'mappings');
  // ConfigSchema.set<string[]>('array', 'layout');

  const MetadataSchema = ConfigSchema.set('object', 'metadata');
  MetadataSchema.set('string', 'title', ({ next }) => {
    if (!next) {
      return 'Grexie';
    } else {
      return `${next} | Grexie`;
    }
  });
  MetadataSchema.set('string', 'hello');
  MetadataSchema.set<string[]>('array', 'layout', ({ next }) => {
    return next;
  });

  const config = ConfigSchema.create({
    render: true,
    mappings: [],
    metadata: {
      hello: 'hello world',
    },
  });
  if (typeof window !== 'undefined') {
    (window as any).defaultConfig = config;
  }

  return config;
};
