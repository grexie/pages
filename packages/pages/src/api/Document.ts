import { Resource } from './Resource';

export interface DocumentOptions {
  resource: Resource;
  initialProps?: DocumentProps;
}

export interface DocumentProps {
  title?: string;
  scripts?: string | string[];
}

export class Document {
  readonly resource: Resource;
  readonly props: DocumentProps = {};

  constructor({ resource, initialProps = {} }: DocumentOptions) {
    this.resource = resource;
    let { title, scripts } = initialProps;

    Object.assign(this.props, { title, scripts });
  }
}
