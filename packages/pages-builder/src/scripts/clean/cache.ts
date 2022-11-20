import fs from 'fs';
import { RootBuildContext } from '../../BuildContext.js';

export default async () => {
  const context = new RootBuildContext({
    fs,
  });

  await context.cache.clean();
};
