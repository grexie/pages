import { execSync, spawn, spawnSync } from 'child_process';
import path from 'path';
import { getWorkspaces } from '../utils/workspaces.js';

interface ServeOptions {
  port?: number;
}

export default (
  { port = 3000 }: ServeOptions,
  name: string,
  ...args: string[]
) => {
  spawnSync('yarn', ['workspace', `@grexie/pages-example-${name}`, ...args], {
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
