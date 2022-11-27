import type { FC, PropsWithChildren } from 'react';
import { useModule } from '@grexie/pages';
import type { StyleSheet } from '@grexie/pages-runtime-styles';
import { Resource } from '@grexie/pages/api';
import type { SourceContext } from '@grexie/pages-builder';

const Markdown: FC<PropsWithChildren<{}>> = ({ children }) => {
  const { default: Component, styles } = useModule({ resource: true });

  if (typeof styles === 'object') {
    Object.values(styles as Record<string, StyleSheet>).forEach(styles => {
      styles.use();
    });
  } else if (typeof styles?.use === 'function') {
    styles.use();
  }

  return <Component components={{ Block: () => <>{children}</> }} />;
};

export default Markdown;

export { resource } from './resource.js';
