import path from 'path';
import fs from 'fs';
import { Provider } from '../api';
import { BuildContext } from '../builder';

export default async () => {
  const context = new BuildContext({
    providers: [
      {
        provider: Provider,
      },
    ],
    fs,
  });
  context.fs.add(path.resolve(context.rootDir, 'build'), fs, true);

  let sources = await context.registry.list();
  const stats = await context.builder.build(sources);
  console.info(stats.toString());
};
