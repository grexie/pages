import React from 'react';
import { createContextWithProps } from '../utils/context';
import { Context } from '../api/Context';

interface ContextProviderProps {
  context: Context;
}

export const {
  Provider: ContextProvider,
  with: withContext,
  use: useContext,
} = createContextWithProps<Context, ContextProviderProps>(
  Provider =>
    ({ context, children }) =>
      <Provider value={context}>{children}</Provider>
);
