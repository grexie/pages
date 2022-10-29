import fs from 'fs';
import { Provider } from '../api/Provider.js';
import { BuildContext } from '../builder/BuildContext.js';

export default async () => {
  const context = new BuildContext({
    providers: [
      {
        provider: Provider,
      },
    ],
    fs,
  });
  context.fs.add(context.outputDir, fs, true);

  let sources = await context.registry.list();
  const stats = await context.builder.build(sources);
  console.info(stats.toString());
};
