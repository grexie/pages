import fs from 'fs';
import { BuildContext } from '@grexie/builder/src/builder/BuildContext.js';

export default async () => {
  const context = new BuildContext({
    fs,
  });

  await context.cache.clean();
};
