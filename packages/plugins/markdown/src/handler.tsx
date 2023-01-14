import type { FC, PropsWithChildren } from 'react';
import { useFirstRender, useModule } from '@grexie/pages';
import type { StyleSheet } from '@grexie/pages-runtime-styles';
import { Resource } from '@grexie/pages/api';
import type { SourceContext } from '@grexie/pages-builder';

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

  if (loading) {
    return (
      <div style={{ display: loading ? 'none' : 'block' }}>
        <Component components={{ Block: () => <>{children}</> }} />
      </div>
    );
  } else {
    return <Component components={{ Block: () => <>{children}</> }} />;
  }
};

export default Markdown;

export { resource } from './resource.js';
