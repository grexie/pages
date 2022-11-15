import { ReactElement } from 'react';
import EventEmitter from 'events';
import type { Resource, ResourceContext } from './Resource.js';

export interface DocumentOptions {
  resource: Resource;
  resourceContext: ResourceContext;
  initialProps?: Partial<DocumentProps>;
}

export interface DocumentProps {
  title?: string;
  children: ReactElement[];
}

export class Document extends EventEmitter {
  readonly resourceContext: ResourceContext;
  readonly resource: Resource;
  readonly props: DocumentProps = { children: [] };

  constructor({ resource, resourceContext }: DocumentOptions) {
    super();

    this.resourceContext = resourceContext;
    this.resource = resource;
  }
}
