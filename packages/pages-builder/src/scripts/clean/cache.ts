import fs from 'fs';
import { RootBuildContext } from '../../BuildContext.js';

export default async () => {
  const context = new RootBuildContext({
    fs,
    cacheKey: '',
  });

  await context.cache.clean();
};
