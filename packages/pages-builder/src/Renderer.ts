import { ComponentType, createElement, PropsWithChildren } from 'react';
import { renderToPipeableStream, renderToStaticMarkup } from 'react-dom/server';
import { Composable, compose, createComposable } from '@grexie/compose';
import { withDocumentComponent } from '@grexie/pages';
import { withDocument, withContext, withResourceContext } from '@grexie/pages';
import { Context, Resource, ResourceContext } from '@grexie/pages/api';
import type { BuildContext } from './BuildContext.js';
import { withStyles, StylesContext } from '@grexie/pages';
import { withScripts } from '@grexie/pages';
import { withLazy } from '@grexie/pages';
import { Writable } from 'stream';
import { EventManager, EventPhase } from './EventManager.js';

export class Renderer {
  readonly #events = EventManager.get<Renderer>(this);
  readonly context: BuildContext;

  constructor(context: BuildContext) {
    this.context = context;
  }

  async render<T extends WritableStream<Buffer>>(
    writable: T,
    resource: (context: Context) => Resource,
    scripts: string[],
    ...composables: [...Composable[], ComponentType]
  ): Promise<T> {
    const styles = new StylesContext();
    const resourceContext = new ResourceContext();

    const hookCollector =
      (composables: Composable[]) =>
      async (specifier: string, exportName: string = 'default') => {
        const exports = await import(specifier);
        composables.push(createComposable(exports[exportName]));
      };

    const beforeRender: Composable[] = [];
    const beforeDocument: Composable[] = [];
    const afterDocument: Composable[] = [];
    const afterRender: Composable[] = [];

    await this.#events.emit(EventPhase.before, 'server', {
      resource,
      render: hookCollector(beforeRender),
      document: hookCollector(beforeDocument),
    });
    await this.#events.emit(EventPhase.after, 'server', {
      resource,
      document: hookCollector(afterDocument),
      render: hookCollector(afterRender),
    });

    const component = compose(
      ...beforeRender,
      withLazy,
      withContext({ context: this.context }),
      withResourceContext({ resourceContext }),
      withStyles({ styles }),
      withDocument({
        resourceContext,
        resource: resourceContext.createResource(resource, this.context)!,
      }),
      withScripts({ scripts }),
      ...beforeDocument,
      withDocumentComponent,
      ...afterDocument,
      ...afterRender,
      ...composables
    );

    const element = createElement(component as any);

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
