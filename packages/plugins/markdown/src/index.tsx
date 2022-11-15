import { FC, PropsWithChildren } from 'react';
import { compile } from '@mdx-js/mdx';
import grayMatter from 'gray-matter';
import { useModule, StyleSheet } from '@grexie/pages';
import { Resource } from '@grexie/pages/api';
import type { SourceContext } from '@grexie/pages-builder';
import { SourceMapGenerator, SourceMapConsumer } from 'source-map';

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
    const imports = (Object.values(context.metadata.styles) as string[])
      .map((stylesheet, i) => {
        return `import __pages_stylesheet_${i} from ${JSON.stringify(
          stylesheet
        )};`;
      })
      .join('\n');
    stylesheets =
      imports +
      '\n' +
      'export const styles = {\n' +
      (Object.keys(context.metadata.styles ?? {}) as string[])

        .map((name, i) => `  ${JSON.stringify(name)}: __pages_stylesheet_${i}`)
        .join(',\n') +
      '};\n';
  } else if (typeof context.metadata.styles === 'string') {
    stylesheets = `export { default as styles } from ${JSON.stringify(
      context.metadata.styles
    )};\n`;
  }

  const source = await compile(
    { path: context.filename, value: content },
    {
      outputFormat: 'program',
      format: 'mdx',
      SourceMapGenerator,
    }
  );

  console.info(source.toString());

  const map = SourceMapGenerator.fromSourceMap(
    new SourceMapConsumer(source.map as any)
  );
  map.setSourceContent(context.filename, content);
  source.map = JSON.parse(map.toString());

  return context.createModule({
    source: stylesheets + source.toString(),
    map: source.map,
    esm: true,
  });
};
