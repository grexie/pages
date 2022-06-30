import { createComposable } from '@grexie/compose';
import React, {
  FC,
  PropsWithChildren,
  useMemo,
  createContext,
  useContext,
  ComponentType,
  FunctionComponent,
  ReactNode,
} from 'react';
import { useResource } from '../hooks';

const DefaultKey = Symbol.for('default');

type OnceContext = Record<string, Record<string | symbol, boolean>>;

const OnceContext = createContext<OnceContext | null>(null);

export interface OnceProps {
  key?: string;
  fallback?: ComponentType<{}> | (() => ReactNode);
}

export const Once: FC<PropsWithChildren<OnceProps>> = ({
  key,
  fallback,
  children,
}) => {
  const resource = useResource({ resource: true });

  let ancestorContext = useContext(OnceContext);

  const context = useMemo(() => {
    const context = Object.assign({}, ancestorContext);
    context[resource.slug] = Object.assign({}, context[resource.slug]);
    context[resource.slug][key ?? DefaultKey] = true;
    return context;
  }, [ancestorContext, resource, key]);

  if (ancestorContext?.[resource.slug]?.[key ?? DefaultKey]) {
    if (fallback) {
      const Component = fallback! as ComponentType;
      return (
        <OnceContext.Provider value={context}>
          <Component />
        </OnceContext.Provider>
      );
    }

    return null;
  }

  return (
    <OnceContext.Provider value={context}>{children}</OnceContext.Provider>
  );
};

export const withOnce =
  <T extends ComponentType<P>, P extends PropsWithChildren<{}>>(
    Component: T
  ): FunctionComponent<P> =>
  (props: P) => {
    const _Component = Component as any;
    return (
      <Once fallback={() => props.children}>
        <_Component {...props} />
      </Once>
    );
  };
