import { getWorkspaces } from '../../utils/workspaces.js';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

export default () => {
  const workspaces = getWorkspaces().filter(
    ({ workspace, location }) =>
      workspace !== '@grexie/pages-monorepo' && !/^examples\//.test(location)
  );

  const tsconfig = JSON.parse(readFileSync('tsconfig.json').toString());
  tsconfig.references = workspaces.map(({ location: path }) => ({ path }));
  writeFileSync('tsconfig.json', JSON.stringify(tsconfig, null, 2));
};

export const args = {};
