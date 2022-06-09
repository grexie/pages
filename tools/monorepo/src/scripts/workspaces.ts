import { spawnSync } from 'child_process';
import chalk from 'chalk';
import { getWorkspaces } from '../utils/workspaces';

export default async (options: any, command: string, ...args: string[]) => {
  const packages = getWorkspaces().filter(({ location }) =>
    /^packages\//.test(location)
  );

  packages.forEach(({ workspace, location }) => {
    console.error(chalk.cyan(`${workspace} ${command} ${args.join(' ')}...`));

    const { error } = spawnSync(command, args, {
      stdio: 'inherit',
      cwd: location,
    });

    if (error) {
      process.exit(1);
    }
  });
};
