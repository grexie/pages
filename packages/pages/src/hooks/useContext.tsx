import { createContextWithProps } from '../utils/context.js';
import { Context } from '../api/Context.js';

interface ContextProviderProps {
  context: Context;
}

export const {
  Provider: ContextProvider,
  with: withContext,
  use: useContext,
} = createContextWithProps<Context, ContextProviderProps>(
  Provider =>
    ({ context, children }) => {
      return <Provider value={context}>{children}</Provider>;
    }
);
