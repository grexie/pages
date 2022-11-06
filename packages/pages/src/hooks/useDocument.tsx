import { useMemo } from 'react';
import {
  Document,
  DocumentProps,
  DocumentOptions,
  mergeDocumentProps,
} from '../api/Document.js';
import { createContextWithProps } from '../utils/context.js';
import hash from 'object-hash';

const {
  Provider: DocumentProvider,
  with: withDocument,
  use: useDocumentContext,
} = createContextWithProps<Document, DocumentOptions>(
  Provider =>
    ({ children, ...options }) => {
      const document = useMemo(() => new Document(options), []);
      return <Provider value={document}>{children}</Provider>;
    }
);

export const useDocument = (props?: DocumentProps) => {
  const document = useDocumentContext();

  if (!document) {
    throw new Error('document context not found');
  }

  useMemo(() => {
    if (props) {
      mergeDocumentProps(document.props, props);
      document.update();
    }
  }, [document, hash(props ?? null, { ignoreUnknown: true })]);

  return document;
};

export { DocumentProvider, withDocument, useDocumentContext };
