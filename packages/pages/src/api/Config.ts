import { ResourceMetadata } from './Resource.js';

export type NormalizedMapping = {
  from: string;
  to: string[];
};

export type Mapping =
  | string
  | NormalizedMapping
  | (Omit<NormalizedMapping, 'to'> & { to: string });

export interface Config extends Record<string, any> {
  render: boolean;
  mappings: Mapping[];
  metadata: ResourceMetadata;
}
