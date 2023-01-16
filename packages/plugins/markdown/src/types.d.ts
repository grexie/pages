declare module '*.mdx?' {
  import { ComponentType, PropsWithChildren } from 'react';
  const Component: ComponentType<PropsWithChildren<{}>>;
  export default Component;
}
