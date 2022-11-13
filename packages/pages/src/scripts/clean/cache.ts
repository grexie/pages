import fs from 'fs';
import { BuildContext } from '../../builder/BuildContext.js';

export default async () => {
  const context = new BuildContext({
    fs,
  });

  await context.cache.clean();
};
