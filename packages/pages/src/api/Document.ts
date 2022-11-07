import { ReactElement, startTransition } from 'react';
import EventEmitter from 'events';
import type { ResourceContext } from '../hooks/index.js';
import type { Resource } from './Resource.js';
import { setImmediate, clearImmediate } from 'timers';

export interface DocumentOptions {
  resource: Resource;
  resourceContext: ResourceContext;
  initialProps?: Partial<DocumentProps>;
}

export interface DocumentProps {
  title?: string;
  children: ReactElement[];
}

export const mergeDocumentProps = (
  props: DocumentProps,
  newProps: Partial<DocumentProps>
) => {
  if (newProps.title) {
    props.title = newProps.title;
  }

  if (newProps.children) {
    newProps.children.forEach(element => {
      const index = props.children.findIndex(
        child =>
          child.props['data-pages-head'] === element.props['data-pages-head']
      );
      if (index !== -1) {
        props.children.splice(index, 1, element);
      } else {
        props.children.push(element);
      }
    });
  }
};

export class Document extends EventEmitter {
  readonly resourceContext: ResourceContext;
  readonly resource: Resource;
  readonly props: DocumentProps = { children: [] };
  #updateImmediate?: NodeJS.Immediate;

  constructor({
    initialProps = {},
    resource,
    resourceContext,
  }: DocumentOptions) {
    super();

    this.resourceContext = resourceContext;
    this.resource = resource;

    mergeDocumentProps(this.props, initialProps);
  }

  update() {
    clearImmediate(this.#updateImmediate);
    this.#updateImmediate = setImmediate(() => {
      startTransition(() => {
        this.emit('update');
      });
    });
  }
}
