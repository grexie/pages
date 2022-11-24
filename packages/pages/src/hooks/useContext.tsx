import { createContextWithProps } from '@grexie/context';
import type { Context } from '../api/Context.js';

interface ContextProviderProps {
  context: Context;
}

export const {
  Provider: ContextProvider,
  with: withContext,
  use: useContext,
} = createContextWithProps<Context, ContextProviderProps>(
  'Pages.Context',
  Provider =>
    ({ context, children }) => {
      return <Provider value={context}>{children}</Provider>;
    }
);
