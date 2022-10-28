import { ComponentType } from 'react';
import { Resource, ResourceMetadata } from './Resource';
import type { SourceContext } from '../builder/SourceContext';
import { compose } from '@grexie/compose';
import { withResource } from '../hooks';

export interface Handler<
  P = any,
  M extends ResourceMetadata = any,
  R extends Resource<M> = Resource<M>
> {
  default?: ComponentType<P>;
  resource?: ((context: SourceContext) => Promise<R>) | Promise<R> | R;
}

export const wrapHandler = (
  resource: Resource,
  handler: Handler,
  ...composables: any[]
) => {
  return compose(...composables, withResource({ resource }), handler as any);
};
