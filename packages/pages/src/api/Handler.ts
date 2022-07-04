import { ComponentType } from 'react';
import { Resource, ResourceMetadata } from './Resource';
import { SourceContext } from '../builder/SourceContext';
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
  exports: any,
  resource: Resource,
  handler: Handler,
  ...composables: any[]
) => {
  if (typeof handler.default === 'function') {
    const Component = compose(
      ...composables,
      withResource({ resource }),
      handler.default as any
    );
    exports.default = Component;
    exports.resource = resource;
    if (!exports.__esModule) {
      exports.__esModule = true;
    }
  }
};
