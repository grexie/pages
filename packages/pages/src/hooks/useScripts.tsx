import { createContextWithProps } from '../utils/context.js';

interface ScriptsProviderProps {
  scripts: string[];
}

export const {
  Provider: ScriptsProvider,
  with: withScripts,
  use: useScripts,
} = createContextWithProps<string[], ScriptsProviderProps>(
  Provider =>
    ({ scripts, children }) =>
      <Provider value={scripts}>{children}</Provider>
);
