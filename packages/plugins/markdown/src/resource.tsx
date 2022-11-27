import type { Resource } from '@grexie/pages';
import type { SourceContext } from '@grexie/pages-builder';

export const resource = /*#__PURE__*/ async (
  context: SourceContext
): Promise<Resource<any>> => {
  const { compile } = await import('@mdx-js/mdx');
  const grayMatter = (await import('gray-matter')).default;
  const { SourceMapGenerator, SourceMapConsumer } = await import('source-map');

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
      SourceMapGenerator: SourceMapGenerator as any,
    }
  );

  const map = SourceMapGenerator.fromSourceMap(
    await new SourceMapConsumer(source.map as any)
  );
  map.setSourceContent(context.filename, content);
  source.map = JSON.parse(map.toString());

  return context.createModule({
    source: stylesheets + source.toString(),
    map: source.map,
    esm: true,
  });
};
