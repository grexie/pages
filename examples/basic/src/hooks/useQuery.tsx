import {
  FC,
  PropsWithChildren,
  createContext,
  useContext,
  useMemo,
} from 'react';
import {
  ApolloClient,
  InMemoryCache,
  NormalizedCacheObject,
  useQuery as _useQuery,
} from '@apollo/client';
import { createComposable } from '@grexie/compose';

const PagesContext = createContext<ApolloClient<NormalizedCacheObject> | null>(
  null
);

export const useQuery: typeof _useQuery = (query, options) => {
  const client = useContext(PagesContext)!;

  return _useQuery(query, {
    client,
    ...options,
  });
};

export const PagesProvider: FC<PropsWithChildren> = ({ children }) => {
  const client = useMemo(
    () =>
      new ApolloClient({
        cache: new InMemoryCache(),
        resolvers: {},
      }),
    []
  );

  return (
    <PagesContext.Provider value={client}>{children}</PagesContext.Provider>
  );
};

export const withPages = createComposable(PagesProvider);
