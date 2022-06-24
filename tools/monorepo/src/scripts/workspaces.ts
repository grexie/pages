import { spawnSync } from 'child_process';
import { cyan } from 'chalk';
import { getWorkspaces } from '../utils/workspaces';

export default async (_: any, command: string, ...args: string[]) => {
  const packages = getWorkspaces().filter(({ location }) =>
    /^packages\//.test(location)
  );

  packages.forEach(({ workspace, location }) => {
    console.error(cyan(`${workspace} ${command} ${args.join(' ')}...`));

    const { error } = spawnSync(command, args, {
      stdio: 'inherit',
      cwd: location,
    });

    if (error) {
      process.exit(1);
    }
  });
};
