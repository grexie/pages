import { ReactElement, startTransition } from 'react';
import EventEmitter from 'events';
import { ResourceContext } from '../hooks/index.js';
import { Resource } from './Resource.js';
import { setImmediate, clearImmediate } from 'timers';

export interface DocumentOptions {
  resource: Resource;
  resourceContext: ResourceContext;
  initialProps?: DocumentProps;
}

export interface DocumentProps {
  title?: string;
  scripts?: string | string[];
  children: ReactElement[];
}

export class Document extends EventEmitter {
  readonly resourceContext: ResourceContext;
  readonly resource: Resource;
  readonly props: DocumentProps = { children: [] };
  #updateImmediate?: NodeJS.Immediate;

  constructor({
    initialProps = { children: [] },
    resource,
    resourceContext,
  }: DocumentOptions) {
    super();

    this.resourceContext = resourceContext;
    this.resource = resource;
    let { title, scripts, children } = initialProps;

    Object.assign(this.props, {
      title,
      scripts,
      children: [...this.props.children, ...children],
    });
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
