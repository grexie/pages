import { useMemo, useContext } from 'react';
import { Document, DocumentOptions } from '../api/Document.js';
import { createContextWithProps } from '@grexie/context';

const {
  Context,
  Provider: DocumentProvider,
  with: withDocument,
  use: useDocumentContext,
} = createContextWithProps<Document, DocumentOptions>(
  Provider =>
    ({ children, ...options }) => {
      console.info('creating document context', options);
      const document = useMemo(() => new Document(options), []);
      return <Provider value={document}>{children}</Provider>;
    }
);

export const useDocument = () => {
  const test = useContext(Context);
  const document = useDocumentContext();

  if (!document) {
    throw new Error('document context not found');
  }

  return document;
};

export { DocumentProvider, withDocument, useDocumentContext };
