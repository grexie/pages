import { createElement, ComponentType } from 'react';
import { Resource, ResourceMetadata } from './Resource.js';
import { hydrateRoot } from 'react-dom/client';
import type { SourceContext } from '../builder/SourceContext.js';
import { compose } from '@grexie/compose';
import {
  ResourceContext,
  StylesContext,
  withContext,
  withDocument,
  withResource,
  withResourceContext,
  withStyles,
} from '../hooks/index.js';
import { withHydratedDocumentComponent } from '../components/Document.js';
import { Context } from './Context.js';
import { withLazy } from '../hooks/useLazy.js';

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

export const hydrate = (resource: Resource, handler: any) => {
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

  const styles = new StylesContext();
  const context = new Context({});
  const resourceContext = new ResourceContext();

  const component = compose(
    withLazy,
    withContext({ context }),
    withStyles({ styles }),
    withResourceContext({ resourceContext }),
    withDocument({ resourceContext, resource }),
    withHydratedDocumentComponent,
    handler
  );

  const element = createElement(component as any);

  if ((window as any).__PAGES_ROOT__) {
    (window as any).__PAGES_ROOT__.render(element);
  } else {
    (window as any).__PAGES_ROOT__ = hydrateRoot(
      document.querySelector('#__pages_root')!,
      element
    );
  }
};
