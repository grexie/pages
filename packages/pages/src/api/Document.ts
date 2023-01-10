import { ReactElement } from 'react';
import EventEmitter from 'events';
import type { Resource, ResourceContext } from './Resource.js';

export interface DocumentOptions {
  resourceContext: ResourceContext;
  resource: Resource;
}

export class Document extends EventEmitter {
  readonly resourceContext: ResourceContext;
  readonly resource: Resource;

  constructor({ resourceContext, resource }: DocumentOptions) {
    super();

    this.resourceContext = resourceContext;
    this.resource = resource;
  }
}
