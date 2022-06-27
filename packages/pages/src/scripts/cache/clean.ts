import fs from 'fs';
import { BuildContext } from '../../builder';

export default async () => {
  const context = new BuildContext({
    fs,
  });

  //await new Promise(() => {});
  await context.cache.clean();
};
