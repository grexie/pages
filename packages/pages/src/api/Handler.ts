import { ComponentType } from 'react';
import { Resource, ResourceMetadata } from './Resource.js';
import type { SourceContext } from '../builder/SourceContext.js';
import { compose } from '@grexie/compose';
import { withResource } from '../hooks/index.js';

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

export const hydrate = (resource: Resource, handler: ComponentType<{}>) => {
  if (typeof window === 'undefined') {
    return;
  }

  const data = (window as any)['__PAGES_DATA__'];
  if (typeof data === 'undefined') {
    return;
  }

  if (data.slug !== resource.slug) {
    return;
  }

  console.info(data);
};
