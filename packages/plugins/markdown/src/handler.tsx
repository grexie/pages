import { FC, PropsWithChildren, useMemo } from 'react';
import { useModule } from '@grexie/pages';
import type { StyleSheet } from '@grexie/pages-runtime-styles';

const Markdown: FC<PropsWithChildren<{}>> = ({ children }) => {
  const { default: Component, styles } = useModule({ resource: true });

  let loading: boolean = false;

  if (typeof styles === 'object') {
    loading ||= Object.values(styles as Record<string, StyleSheet>).reduce(
      (a, styles) => {
        const loading = styles.use();
        return a || loading;
      },
      false
    );
  } else if (typeof styles?.use === 'function') {
    loading ||= styles.use();
  }

  const element = useMemo(
    () => <Component components={{ Block: () => <>{children}</> }} />,
    []
  );

  if (loading) {
    return <div style={{ display: loading ? 'none' : 'block' }}>element</div>;
  } else {
    return element;
  }
};

export default Markdown;

export { resource } from './resource.js';
