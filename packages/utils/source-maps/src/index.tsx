import React, {
  FC,
  PropsWithChildren,
  createContext as _createContext,
  useContext as _useContext,
  useMemo,
  useContext,
  createElement,
} from 'react';
import { createComposableWithProps } from '@grexie/compose';

export interface SharedContexts {
  readonly contexts: React.Context<any>[];
  readonly values: any[];
}

class SharedContext {
  readonly contexts: React.Context<any>[] = [];

  shareContext(context: React.Context<any>) {
    this.contexts.push(context);
  }

  use(): SharedContexts {
    const values: any[] = [];
    for (const context of this.contexts) {
      values.push(useContext(context));
    }
    return { contexts: this.contexts, values };
  }
}

export interface SharedContextProps {
  context?: React.Context<any>;
}

interface SharedContextCloneProps {
  contexts: SharedContexts;
}

export const SharedContextClone: FC<
  PropsWithChildren<SharedContextCloneProps>
> = ({ contexts, children }) => {
  return useMemo(() => {
    if (!contexts) {
      return <>{children}</>;
    }

    let element = children;

    for (let i = contexts.contexts.length - 1; i >= 0; i--) {
      element = createElement(
        contexts.contexts[i].Provider,
        { value: contexts.values[i] },
        element
      );
    }

    return element;
  }, [contexts]) as any;
};

export const useSharedContexts = () => {
  const sharedContext = _useSharedContext();
  return sharedContext.use();
};

type ProviderCreator<T extends unknown, P extends Object = {}> = (
  Provider: React.Context<T>['Provider']
) => FC<PropsWithChildren<P>>;

export const createContextWithProps = <
  T extends unknown,
  P extends Object = {}
>(
  creator: ProviderCreator<T, P>,
  shared: boolean = true
) => {
  const Context = _createContext<T | undefined>(undefined);
  if (shared) {
    creator = ((
      creator: ProviderCreator<T, P>,
      provider: React.Context<T>['Provider']
    ) => withSharedContext({ context: Context })(creator(provider))).bind(
      null,
      creator
    );
  }
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

export const {
  Provider: SharedContextProvider,
  use: _useSharedContext,
  with: withSharedContext,
} = createContextWithProps<SharedContext, SharedContextProps>(
  Provider =>
    ({ context, children }) => {
      const existingSharedContext = _useSharedContext();
      const sharedContext = useMemo(
        () => existingSharedContext ?? new SharedContext(),
        []
      );

      useMemo(() => {
        if (context) {
          sharedContext.shareContext(context);
        }
      }, []);

      return <Provider value={sharedContext}>{children}</Provider>;
    },
  false
);
