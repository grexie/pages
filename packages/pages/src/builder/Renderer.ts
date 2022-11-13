import { createElement } from 'react';
import { renderToPipeableStream } from 'react-dom/server';
import { compose } from '@grexie/compose';
import { withDocumentComponent } from '../components/Document.js';
import {
  withDocument,
  withContext,
  withResourceContext,
} from '../hooks/index.js';
import { Resource, ResourceContext } from '../api/Resource.js';
import type { BuildContext } from './BuildContext.js';
import { withStyles, StylesContext } from '../hooks/useStyles.js';
import { withScripts } from '../hooks/useScripts.js';
import { withLazy } from '../hooks/useLazy.js';
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
