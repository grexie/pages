import { createContext } from '@grexie/context';

export const { Provider: withTest, use: useTest } = createContext<boolean>(
  'Test',
  Provider =>
    ({ children }) => {
      return <Provider value={true}>{children}</Provider>;
    }
);

export default withTest;
