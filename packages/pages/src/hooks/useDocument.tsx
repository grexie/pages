import React, { useMemo } from 'react';
import { Document, DocumentProps, DocumentOptions } from '../api/Document';
import { createContextWithProps } from '../utils/context';

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

  useMemo(() => {
    if (props) {
      Object.assign(document.props, props);
    }
  }, [document, JSON.stringify(props)]);

  return document;
};

export { DocumentProvider, withDocument };
