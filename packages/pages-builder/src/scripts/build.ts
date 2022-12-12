import fs from 'fs';
import { Provider } from '../Provider.js';
import { RootBuildContext } from '../BuildContext.js';

export default async () => {
  process.env.NODE_ENV = process.env.NODE_ENV ?? 'production';

  const context = new RootBuildContext({
    fs,
    cacheKey: 'build',
  });
  context.fs.add(context.outputDir, fs, true);

  const stats = await context.builder.build();
  process.stdout.write(stats.toString({ modulesSpace: 9999, colors: true }));
};
