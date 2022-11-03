import { createElement } from 'react';
import { renderToPipeableStream } from 'react-dom/server';
import { Writable } from 'stream';
import { compose } from '@grexie/compose';
import { withDocumentComponent } from '../components/Document.js';
import {
  withDocument,
  withContext,
  ResourceContext,
  withResourceContext,
} from '../hooks/index.js';
import { Resource } from '../api/index.js';
import { BuildContext } from './index.js';
import { withLazy } from '../hooks/index.js';
import { withStyles, StylesContext } from '../hooks/useStyles.js';

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
    const styles = new StylesContext();

    const component = compose(
      withLazy,
      withContext({ context: this.context }),
      withResourceContext({ resourceContext }),
      withStyles({ styles }),
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

    return Promise.resolve(writable);
  }
}
