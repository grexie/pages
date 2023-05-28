import { createContextWithProps } from '@grexie/context';

type PropsProviderProps = Omit<Record<string, any>, 'children'>;

export const {
  Provider: PropsProvider,
  with: withProps,
  use: useProps,
} = createContextWithProps<any, PropsProviderProps>(
  'Pages.Props',
  Provider =>
    ({ children, ...props }) => {
      return <Provider value={props}>{children}</Provider>;
    }
);
