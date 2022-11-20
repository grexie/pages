import { execSync, spawn, spawnSync } from 'child_process';
import path from 'path';
import { getWorkspaces } from '../utils/workspaces';

interface ServeOptions {
  port?: number;
}

export default (
  { port = 3000 }: ServeOptions,
  name: string,
  ...args: string[]
) => {
  spawnSync('pages', args, {
    cwd: path.resolve(process.cwd(), 'examples', name),
    env: {
      ...process.env,
      PORT: `${port}`,
    },
    stdio: 'inherit',
  });
};

export const args = {
  number: ['port'],
  alias: {
    port: 'p',
  },
  stopEarly: true,
};
