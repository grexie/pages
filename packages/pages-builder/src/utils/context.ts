import {
  FC,
  PropsWithChildren,
  createContext as _createContext,
  useContext as _useContext,
} from 'react';
import { createComposableWithProps } from '@grexie/compose';

export const createContextWithProps = <T extends unknown, P = {}>(
  creator: (Provider: React.Context<T>['Provider']) => FC<PropsWithChildren<P>>
) => {
  const Context = _createContext<T | undefined>(undefined);
  const ContextProvider = creator(
    Context.Provider as React.Context<T>['Provider']
  );

  return {
    Context,
    Provider: ContextProvider,
    with: createComposableWithProps<P>(ContextProvider),
    use: () => _useContext(Context)!,
  };
};

export const createContext = <T extends unknown>(
  creator: (Provider: React.Context<T>['Provider']) => FC<PropsWithChildren<{}>>
) => {
  const context = createContextWithProps<T>(creator);
  return { ...context, with: context.with({}) };
};
