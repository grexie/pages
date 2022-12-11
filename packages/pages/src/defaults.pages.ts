import type { Mapping } from './api/Config.js';
import { ObjectSchema } from '@grexie/proxy';

export default (): any => {
  const ConfigSchema = new ObjectSchema();
  ConfigSchema.set('boolean', 'render');
  ConfigSchema.set<Mapping[]>('array', 'mappings');
  ConfigSchema.set('string', 'title');
  ConfigSchema.set<string[]>('array', 'layout');
  ConfigSchema.set('object', 'styles');

  const config = ConfigSchema.create({
    render: true,
  });
  if (typeof window !== 'undefined') {
    (window as any).defaultConfig = config;
  }

  return config;
};
