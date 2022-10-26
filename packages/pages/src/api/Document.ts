import { ReactElement } from 'react';
import { ResourceContext } from '../hooks';
import { Resource } from './Resource';

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

export class Document {
  readonly resourceContext: ResourceContext;
  readonly resource: Resource;
  readonly props: DocumentProps = { children: [] };

  constructor({
    initialProps = { children: [] },
    resource,
    resourceContext,
  }: DocumentOptions) {
    this.resourceContext = resourceContext;
    this.resource = resource;
    let { title, scripts, children } = initialProps;

    Object.assign(this.props, {
      title,
      scripts,
      children: [...this.props.children, ...children],
    });
  }
}
