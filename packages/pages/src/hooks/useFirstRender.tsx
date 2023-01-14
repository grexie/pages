import { createContext } from '@grexie/context';
import { useEffect, useState } from 'react';

export const {
  Provider: FirstRenderProvider,
  with: withFirstRenderProvider,
  use: useFirstRender,
} = createContext<boolean>('Pages.FirstRender', Provider => ({ children }) => {
  const [isFirstRender, setFirstRender] = useState(true);

  useEffect(() => {
    setFirstRender(false);
  }, []);

  return <Provider value={isFirstRender}>{children}</Provider>;
});
