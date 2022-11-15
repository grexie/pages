import { createElement } from 'react';
import { renderToPipeableStream } from 'react-dom/server';
import { compose } from '@grexie/compose';
import { withDocumentComponent } from '@grexie/pages';
import { withDocument, withContext, withResourceContext } from '@grexie/pages';
import { Resource, ResourceContext } from '@grexie/pages/api';
import type { BuildContext } from './BuildContext.js';
import { withStyles, StylesContext } from '@grexie/pages';
import { withScripts } from '@grexie/pages';
import { withLazy } from '@grexie/pages';
import { Writable } from 'stream';

export class Renderer {
  readonly context: BuildContext;

  constructor(context: BuildContext) {
    this.context = context;
  }

  async render<T extends WritableStream<Buffer>>(
    writable: T,
    resource: Resource,
    scripts: string[],
    ...composables: any[]
  ): Promise<T> {
    const styles = new StylesContext();
    const resourceContext = new ResourceContext();

    const component = compose(
      withLazy,
      withContext({ context: this.context }),
      withResourceContext({ resourceContext }),
      withStyles({ styles }),
      withDocument({ resourceContext, resource }),
      withScripts({ scripts }),
      withDocumentComponent,
      ...composables
    );

    const element = createElement(component as any);

    console.info('rendering', resource.slug);
    await new Promise<void>((resolve, reject) => {
      renderToPipeableStream(element, {
        onError: err => reject(err),
        onShellError: err => reject(err),
        onAllReady: () => resolve(),
      }).pipe((Writable as any).fromWeb(writable));
    });

    return Promise.resolve(writable);
  }
}
