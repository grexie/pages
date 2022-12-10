import { spawnSync } from 'child_process';
import chalk from 'chalk';
import { getWorkspaces } from '../utils/workspaces.js';

interface WorkspacesOptions {
  silent?: boolean;
  json?: boolean;
  print?: boolean;
}

export default async (
  { silent = false, print = false, json = false }: WorkspacesOptions,
  command: string,
  ...args: string[]
) => {
  if (print) {
    if (json) {
      console.info(JSON.stringify(getWorkspaces(), null, 2));
    } else {
      getWorkspaces().forEach(result =>
        console.info(`${result.workspace}: ${result.location}`)
      );
    }
    return;
  }

  const packages = getWorkspaces().filter(({ location }) =>
    /^packages\//.test(location)
  );

  let results = [];

  packages.forEach(({ workspace, location }) => {
    if (!silent) {
      console.error(chalk.cyan(`${workspace} ${command} ${args.join(' ')}...`));
    }

    const { error, stdout } = spawnSync(command, args, {
      stdio: json ? 'pipe' : 'inherit',
      cwd: location,
    });

    if (json) {
      results.push(JSON.parse(stdout.toString()));
    }

    if (error) {
      process.exit(1);
    }
  });

  if (json) {
    console.info(JSON.stringify(results, null, 2));
  }
};

export const args = {
  boolean: ['silent', 'json', 'print'],
  alias: {
    silent: 's',
    json: 'j',
    print: 'p',
  },
  stopEarly: true,
};
