import {
  SourceMapConsumer,
  SourceMapGenerator,
  RawSourceMap,
} from 'source-map';

export const offsetLines = async (
  incomingSourceMap: RawSourceMap,
  lineOffset: number
) => {
  const consumer = await new SourceMapConsumer(incomingSourceMap);
  const generator = new SourceMapGenerator({
    file: incomingSourceMap.file,
    sourceRoot: incomingSourceMap.sourceRoot,
  });
  consumer.eachMapping(function (m) {
    if (
      typeof m.originalLine === 'number' &&
      0 < m.originalLine &&
      typeof m.originalColumn === 'number' &&
      0 <= m.originalColumn &&
      m.source
    ) {
      generator.addMapping({
        source: m.source,
        name: m.name,
        original: { line: m.originalLine, column: m.originalColumn },
        generated: {
          line: m.generatedLine + lineOffset,
          column: m.generatedColumn,
        },
      });
    }
  });
  const outgoingSourceMap = JSON.parse(generator.toString()) as RawSourceMap;
  if (typeof incomingSourceMap.sourcesContent !== 'undefined') {
    outgoingSourceMap.sourcesContent = incomingSourceMap.sourcesContent;
  }
  return outgoingSourceMap;
};
