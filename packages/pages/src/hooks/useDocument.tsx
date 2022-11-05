import { useMemo } from 'react';
import { Document, DocumentProps, DocumentOptions } from '../api/Document.js';
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
      const { children, ..._props } = props;
      Object.assign(document.props, _props);
      document.props.children = [...document.props.children, ...children];
      document.update();
    }
  }, [document, hash(props ?? null, { ignoreUnknown: true })]);

  return document;
};

export { DocumentProvider, withDocument, useDocumentContext };
