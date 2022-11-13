import type { Document } from '../api/Document.js';
import { useRef } from 'react';
import { useDocument } from './useDocument.js';

const nextIdTable = new WeakMap<Document, { value: number }>();

export const useMountId = () => {
  const document = useDocument();
  if (!nextIdTable.has(document)) {
    nextIdTable.set(document, { value: 0 });
  }
  const nextId = nextIdTable.get(document);

  const ref = useRef<string>();

  if (!ref.current) {
    ref.current = (++nextId!.value).toString();
  }

  return ref.current;
};
