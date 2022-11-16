import { getWorkspaces } from '../../utils/workspaces';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

export default () => {
  const workspaces = getWorkspaces().filter(
    ({ workspace }) => workspace !== '@grexie/pages-monorepo'
  );

  const tsconfig = JSON.parse(readFileSync('tsconfig.json').toString());
  tsconfig.references = workspaces.map(({ location: path }) => ({ path }));
  writeFileSync('tsconfig.json', JSON.stringify(tsconfig, null, 2));
};

export const args = {};
