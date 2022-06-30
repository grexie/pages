import { createElement } from 'react';
import { renderToPipeableStream } from 'react-dom/server';
import { Writable } from 'stream';
import { compose } from '@grexie/compose';
import { withDocumentComponent } from '../components/Document';
import {
  withDocument,
  withContext,
  ResourceContext,
  withResourceContext,
} from '../hooks';
import { Handler, Resource } from '../api';
import { BuildContext } from '../builder';
import {
  withResource,
  withLazy,
  withErrorManager,
  ErrorManager,
} from '../hooks';

export class Renderer {
  readonly context: BuildContext;

  constructor(context: BuildContext) {
    this.context = context;
  }

  async render<T extends Writable>(
    writable: T,
    resourceContext: ResourceContext,
    resource: Resource,
    ...composables: any[]
  ): Promise<T> {
    const errorManager = new ErrorManager();

    const component = compose(
      withErrorManager({ errorManager }),
      withLazy({ errorManager }),
      withContext({ context: this.context }),
      withResourceContext({ resourceContext }),
      withDocument({ resourceContext, resource }),
      withDocumentComponent,
      ...composables
    );

    const element = createElement(component as any);
    await new Promise<void>((resolve, reject) => {
      renderToPipeableStream(element, {
        onError: err => reject(err),
        onShellError: err => reject(err),
        onAllReady: () => resolve(),
      }).pipe(writable);
    });
    errorManager.throwIfErrors();

    return Promise.resolve(writable);
  }
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
