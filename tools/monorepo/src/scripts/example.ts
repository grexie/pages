import { spawn } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { basename, resolve } from 'path';
import { cyan, gray } from 'chalk';
import { getWorkspaces } from '../utils/workspaces';

interface RunOptions {
  parallel?: boolean;
  silent?: boolean;
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
  { port }: RunOptions,
  name: string,
  command: string,
  ...args: string[]
) => {};

export const args = {
  boolean: ['parallel', 'silent'],
  alias: {
    parallel: 'p',
    silent: 's',
  },
  stopEarly: true,
};
