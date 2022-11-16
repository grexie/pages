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

  // const tsconfigBase = JSON.parse(
  //   readFileSync('tsconfig.base.json').toString()
  // );
  // tsconfigBase.include = workspaces
  //   .map(({ location }) => [
  //     join(location, 'src', '**', '*.ts'),
  //     join(location, 'src', '**', '*.tsx'),
  //   ])
  //   .reduce((a, b) => [...a, ...b], []);
  // tsconfigBase.exclude = workspaces
  //   .map(({ location }) => [
  //     join(location, 'src', '**', '*.spec.ts'),
  //     join(location, 'src', '**', '*.spec.tsx'),
  //     join(location, 'src', '**', '*.test.ts'),
  //     join(location, 'src', '**', '*.test.tsx'),
  //   ])
  //   .reduce((a, b) => [...a, ...b], []);
  // tsconfigBase.compilerOptions.paths = workspaces
  //   .map(({ workspace, location }) => ({
  //     [workspace]: ['./' + join(location, 'src')],
  //     [join(workspace, '*')]: ['./' + join(location, 'src', '*')],
  //   }))
  //   .reduce((a, b) => ({ ...a, ...b }), {});
  // tsconfigBase.compilerOptions.rootDir = '.';
  // tsconfigBase.compilerOptions.rootDirs = workspaces
  //   .map(({ workspace, location }) => ['./' + join(location, 'src')])
  //   .reduce((a, b) => [...a, ...b], []);
  // tsconfigBase.compilerOptions.types = workspaces.map(
  //   ({ workspace }) => workspace
  // );

  // writeFileSync('tsconfig.base.json', JSON.stringify(tsconfigBase, null, 2));
};

export const args = {};
