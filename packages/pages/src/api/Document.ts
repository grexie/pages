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
}

export class Document {
  readonly resourceContext: ResourceContext;
  readonly resource: Resource;
  readonly props: DocumentProps = {};

  constructor({
    initialProps = {},
    resource,
    resourceContext,
  }: DocumentOptions) {
    this.resourceContext = resourceContext;
    this.resource = resource;
    let { title, scripts } = initialProps;

    Object.assign(this.props, { title, scripts });
  }
}
