import { createElement } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { compose } from '@grexie/compose';
import { ResourceContext } from '@grexie/pages';
import {
  StylesContext,
  withContext,
  withDocument,
  withResource,
  withResourceContext,
  withStyles,
} from '@grexie/pages';
import { withDocumentContent } from '@grexie/pages';
import { Context } from '@grexie/pages';
import { withLazy } from '@grexie/pages';
import type { Resource } from '@grexie/pages';
import type { Handler } from '@grexie/pages-builder';

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
    withDocumentContent,
    handler
  );

  const element = createElement(component as any);

  console.info('rendering');
  if ((window as any).__PAGES_ROOT__) {
    (window as any).__PAGES_ROOT__.render(element);
  } else {
    (window as any).__PAGES_ROOT__ = hydrateRoot(
      document.querySelector('#__pages_root')!,
      element,
      {
        onRecoverableError: err => {
          console.error(err);
        },
      }
    );
    (window as any).__PAGES_ROOT__.render(element);
  }
};
