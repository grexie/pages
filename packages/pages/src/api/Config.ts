import { ResourceMetadata } from './Resource.js';

export interface Config extends Record<string, any> {
  render: boolean;
  metadata: ResourceMetadata;
}
