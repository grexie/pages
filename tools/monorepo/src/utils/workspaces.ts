import glob from 'glob';
import { dirname, resolve, join } from 'path';
import { readFileSync } from 'fs';
import path from 'path';
import chalk from 'chalk';

const __dirname = path.dirname(new URL(import.meta.url).pathname);

export const getWorkspaces = () => {
  const workspaceGlobs: string[] = JSON.parse(
    readFileSync(
      resolve(__dirname, '..', '..', '..', '..', 'package.json')
    ).toString()
  ).workspaces;

  const packageFiles = workspaceGlobs
    .map(g => glob.sync(g + '/package.json'))
    .reduce((a: string[], b: string[]) => [...a, ...b], []);

  return packageFiles
    .map(filename => {
      try {
        const json = JSON.parse(readFileSync(filename).toString());
        return {
          workspace: json.name as string,
          location: dirname(filename),
        };
      } catch (err) {
        console.error(chalk.bold.red(filename));
      }
    })
    .filter(({ location }) => !location.startsWith('tools/'));
};
