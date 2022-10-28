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

  if (!document) {
    throw new Error('document context not found');
  }

  useMemo(() => {
    if (props) {
      const { children, ..._props } = props;
      Object.assign(document.props, _props);
      document.props.children = [...document.props.children, ...children];
    }
  }, [document, JSON.stringify(props)]);

  return document;
};

export { DocumentProvider, withDocument };
