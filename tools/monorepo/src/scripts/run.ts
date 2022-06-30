import { spawn } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { basename, resolve } from 'path';
import { cyan, gray } from 'chalk';
import { getWorkspaces } from '../utils/workspaces';

interface RunOptions {
  parallel: boolean;
}

interface ResolvablePromise<T = void>
  extends Required<Resolver<T>>,
    Promise<T> {}

interface Resolver<T = void> {
  readonly resolved: boolean;
  readonly resolve: (value: T) => void;
  readonly reject: (error: Error) => void;
}

const createResolver = <T = void>() => {
  const resolver: Resolver<T> = {} as unknown as Resolver<T>;
  const promise = new Promise<T>((resolve, reject) => {
    let resolved = false;

    Object.assign(resolver, {
      get resolved() {
        return resolved;
      },
      resolve: (value: T) => {
        resolved = true;
        resolve(value);
      },
      reject: (err: Error) => {
        resolved = true;
        reject(err);
      },
    });
  });
  Object.assign(promise, resolver);
  return promise as unknown as ResolvablePromise<T>;
};

const stripAnsiCursor = (text: string) =>
  text.replace(
    /\033(c|\[\d+;\d+[Hf]|\[[HMsuJK]|\[\d+[ABCDEFGnJK]|\[[=?]\d+[hl])/g,
    ''
  );

export default async (
  { parallel = false }: RunOptions,
  command: string,
  ...args: string[]
) => {
  const packages = getWorkspaces().filter(({ location }) =>
    /^packages\//.test(location)
  );

  const maxLength = packages.reduce(
    (a, b) => Math.max(a, basename(b.location).length),
    0
  );

  let runLock: ResolvablePromise;
  let i = 0;
  const finished = createResolver();

  await Promise.all(
    packages.map(async ({ workspace, location }) => {
      const skipped = (reason: string) =>
        console.error(gray(`${workspace} skipped due to ${reason}`));

      const packagePath = resolve(location, 'package.json');

      if (!existsSync(packagePath)) {
        skipped('no package.json');
        return;
      }

      const pkg = JSON.parse(readFileSync(packagePath).toString());

      if (!pkg.scripts[command]) {
        skipped(`no script named ${command}`);
        return;
      }

      const logName = basename(location).padEnd(maxLength, ' ');

      if (!parallel) {
        if (runLock) {
          await runLock;
        }
        runLock = createResolver();
      }

      console.error(cyan(`[${logName}] yarn run ${command}`));

      const child = spawn('yarn', ['run', command, ...args], {
        env: { ...process.env, FORCE_COLOR: '3' },
        stdio: ['ignore', 'pipe', 'pipe'],
        cwd: location,
      });

      child.stdout.on('data', data => {
        data = stripAnsiCursor(data.toString().trim());
        if (!data) {
          return;
        }
        const lines = data.split(/\n|\r\n|\r/g) as string[];
        lines.forEach(line => {
          process.stdout.write(cyan(`[${logName}] `));
          process.stdout.write(line);
          process.stdout.write('\n');
        });
      });
      child.stderr.on('data', data => {
        data = stripAnsiCursor(data.toString().trim());
        if (!data) {
          return;
        }
        const lines = data.split(/\n|\r\n/g) as string[];
        lines.forEach(line => {
          process.stderr.write(cyan(`[${logName}] `));
          process.stderr.write(line);
          process.stderr.write('\n');
        });
      });

      const childPromise = new Promise<{ workspace: string; code: number }>(
        (resolve, reject) => {
          child.on('exit', code => {
            if (code === 0) {
              resolve({ workspace, code });
            } else {
              reject({ workspace, code });
            }
            runLock?.resolve();
          });
        }
      );

      finished.finally(() => child.kill('SIGTERM'));

      return childPromise;
    })
  ).finally(() => !finished.resolved && finished.resolve());
};

export const args = {
  boolean: ['parallel'],
  alias: {
    parallel: 'p',
  },
  stopEarly: true,
};
