import fs from 'fs';
import { Provider } from '../Provider.js';
import { RootBuildContext } from '../BuildContext.js';

export default async () => {
  const context = new RootBuildContext({
    providers: [
      {
        provider: Provider,
      },
    ],
    fs,
  });
  context.fs.add(context.outputDir, fs, true);

  const stats = await context.builder.build();
  console.info(stats.toString({ colors: true }));
};
