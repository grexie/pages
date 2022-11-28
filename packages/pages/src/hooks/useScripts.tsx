import { createContextWithProps } from '@grexie/context';

interface ScriptsProviderProps {
  scripts: string[];
}

export const {
  Provider: ScriptsProvider,
  with: withScripts,
  use: useScripts,
} = createContextWithProps<string[], ScriptsProviderProps>(
  'Pages.Scripts',
  Provider =>
    ({ scripts, children }) =>
      <Provider value={scripts}>{children}</Provider>
);
