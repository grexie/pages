import { useMemo, ComponentType } from 'react';
import { createContextWithProps } from '@grexie/context';
import { compose } from '@grexie/compose';
import EventEmitter from 'events';
import { Resource } from './useResource.js';

export interface DocumentOptions {
  resource: Resource;
}

export class Document extends EventEmitter {
  readonly resource: Resource;

  constructor({ resource }: DocumentOptions) {
    super();

    this.resource = resource;
  }
}

const {
  Provider: DocumentProvider,
  with: withDocument,
  use: useDocumentContext,
} = createContextWithProps<Document, DocumentOptions>(
  'Pages.Document',
  Provider =>
    ({ children, ...options }) => {
      const existingDocument = useDocumentContext();

      if (existingDocument) {
        return <>{children}</>;
      }

      const document = useMemo(() => new Document(options), []);
      return <Provider value={document}>{children}</Provider>;
    }
);

export const useDocument = () => {
  const document = useDocumentContext();

  if (!document) {
    throw new Error('document context not found');
  }

  return document;
};

export const wrapDocument = (
  Component: ComponentType<any>,
  resource: Resource<any>
) => compose(withDocument({ resource }), Component);

export { DocumentProvider, withDocument, useDocumentContext };
