import React, { createElement } from 'react';
import ReactDOMServer from 'react-dom/server';
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

export class Renderer {
  readonly context: BuildContext;

  constructor(context: BuildContext) {
    this.context = context;
  }

  async render<T extends WritableStream>(
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

    const stream = await ReactDOMServer.renderToReadableStream(element);

    await stream.pipeTo(writable);
    return Promise.resolve(writable);
  }
}
