import { createElement, StrictMode } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { compose, createComposable, Composable } from '@grexie/compose';
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
import { update } from '@grexie/pages-runtime-hmr';

export const wrapHandler = (
  resource: (context: Context) => Resource,
  handler: Handler,
  ...composables: any[]
) => {
  return compose(...composables, withResource({ resource }), handler as any);
};
export interface RenderHooks {
  beforeRender: Composable[];
  beforeDocument: Composable[];
  afterDocument: Composable[];
  afterRender: Composable[];
}

export const hydrate = (
  resourceFactory: (context: Context) => Resource,
  handler: any,
  hooks: RenderHooks
) => {
  if (typeof window === 'undefined') {
    return;
  }

  const data = (window as any)['__PAGES_DATA__'];
  if (typeof data === 'undefined') {
    return;
  }

  const context = new Context({});
  const resourceContext = new ResourceContext();
  const resource = resourceContext.createResource(resourceFactory, context);

  if (data.slug !== resource.slug) {
    return;
  }

  const styles = new StylesContext();

  const Component = compose(
    ...hooks.beforeRender,
    withLazy,
    withContext({ context }),
    withStyles({ styles }),
    withResourceContext({ resourceContext }),
    withDocument({ resourceContext, resource }),
    ...hooks.beforeDocument,
    withDocumentContent,
    ...hooks.afterDocument,
    ...hooks.afterRender,
    handler
  );

  const element = <Component />;
  // const element = (
  //   <StrictMode>
  //     <Component />
  //   </StrictMode>
  // );

  if ((window as any).__PAGES_ROOT__) {
    (window as any).__PAGES_ROOT__.render(element);
    return (window as any).__PAGES_ROOT__;
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
    return (window as any).__PAGES_ROOT__;
  }
};

update((import.meta as any).webpackHot);
