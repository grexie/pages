import { ComponentType } from 'react';
import { Resource, ResourceMetadata } from './Resource';
import { SourceContext } from '../builder/SourceContext';

export interface Handler<
  P = any,
  M extends ResourceMetadata = any,
  R extends Resource<M> = Resource<M>
> {
  default?: ComponentType<P>;
  resource?: ((context: SourceContext) => Promise<R>) | Promise<R> | R;
}
