import type { ComponentType } from 'react';
import type { Resource, ResourceMetadata } from './Resource.js';
import type { SourceContext } from '@grexie/pages-builder';

export interface Handler<
  P = any,
  M extends ResourceMetadata = any,
  R extends Resource<M> = Resource<M>
> {
  default?: ComponentType<P>;
  resource?: ((context: SourceContext) => Promise<R>) | Promise<R> | R;
}
