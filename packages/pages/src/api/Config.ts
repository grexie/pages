import type { Resource, ResourceMetadata } from './Resource.js';

export type NormalizedMapping = {
  from: string;
  to: string[];
};

export type Mapping =
  | string
  | NormalizedMapping
  | (Omit<NormalizedMapping, 'to'> & { to: string });

export interface Config<M extends ResourceMetadata = any>
  extends Record<string, any> {
  metadata: M;
}
