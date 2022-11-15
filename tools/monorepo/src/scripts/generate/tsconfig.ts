import { getWorkspaces } from '../../utils/workspaces';
import { writeFileSync } from 'fs';

export default () => {
  const workspaces = getWorkspaces().filter(
    ({ workspace }) => workspace !== '@grexie/pages-monorepo'
  );

  const tsconfig = {
    files: [],
    compilerOptions: {
      allowSyntheticDefaultImports: false,
    },
    references: workspaces.map(({ location: path }) => ({ path })),
  };

  writeFileSync('tsconfig.json', JSON.stringify(tsconfig, null, 2));
};

export const args = {};
