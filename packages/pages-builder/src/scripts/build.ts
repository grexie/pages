import fs from 'fs';
import { Provider } from '../Provider.js';
import { RootBuildContext } from '../BuildContext.js';
import { Source } from '../Source.js';

export default async () => {
  process.env.NODE_ENV = process.env.NODE_ENV ?? 'production';

  const context = new RootBuildContext({
    fs,
    cacheKey: 'build',
  });
  context.fs.add(context.outputDir, fs, true);

  const sources = new Set<Source>();
  await context.builder.build(sources);
  for (const source of await context.sources.getAllSources()) {
    sources.add(source);
  }
  console.info([...sources].map(source => source.slug));
  const stats = await context.builder.build(sources);
  process.stdout.write(stats.toString({ modulesSpace: 9999, colors: true }));
};
