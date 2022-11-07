import { createElement } from 'react';
import { renderToReadableStream } from 'react-dom/server';
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
import { withStyles, StylesContext } from '../hooks/useStyles.js';
import { withScripts } from '../hooks/useScripts.js';
import { withLazy } from '../hooks/useLazy.js';

export class Renderer {
  readonly context: BuildContext;

  constructor(context: BuildContext) {
    this.context = context;
  }

  async render<T extends WritableStream>(
    writable: T,
    resourceContext: ResourceContext,
    resource: Resource,
    scripts: string[],
    ...composables: any[]
  ): Promise<T> {
    const styles = new StylesContext();

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

    const stream = await renderToReadableStream(element);

    await stream.pipeTo(writable);
    return Promise.resolve(writable);
  }
}
