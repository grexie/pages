import React, { FC, PropsWithChildren } from 'react';
import { compile } from '@mdx-js/mdx';
import grayMatter from 'gray-matter';
import { useModule } from '../hooks/index.js';
import { Resource } from '../api/index.js';
import type { SourceContext } from '../builder/SourceContext.js';
import { StyleSheet } from '../runtime/styles.js';

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

export const resource = async (
  context: SourceContext
): Promise<Resource<any>> => {
  const { content, data: metadata } = grayMatter(context.content.toString());
  Object.assign(context.metadata, metadata);

  let stylesheets = '';
  if (typeof context.metadata.styles === 'object') {
    stylesheets =
      'export const styles = {' +
      (
        Object.entries(context.metadata.styles ?? {}) as unknown as [
          string,
          string
        ][]
      )
        .map(
          ([name, stylesheet]) =>
            `${name}: require(${JSON.stringify(stylesheet)})`
        )
        .join(', ') +
      '};\n';
  } else if (typeof context.metadata.styles === 'string') {
    stylesheets = `export { default as styles } from ${JSON.stringify(
      context.metadata.styles
    )};\n`;
  }

  console.info(content);
  const source = await compile(content, {
    outputFormat: 'program',
  });

  return context.createModule({
    source: stylesheets + source.toString(),
    esm: true,
  });
};
