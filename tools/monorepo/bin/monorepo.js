#!/usr/bin/env -S node --loader ts-node/esm/transpile-only --no-warnings

import path from 'path';
import parseArgs from 'minimist';
import chalk from 'chalk';

const __dirname = path.dirname(new URL(import.meta.url).pathname);

const importScript = async name => {
  const module = await import(
    path.resolve(
      __dirname,
      '..',
      'src',
      'scripts',
      name.replace(/:/g, '/') + '.ts'
    )
  );

  return {
    script: module.default,
    argsDescriptor: module.args ?? {},
  };
};

const main = async (name, ...rawArgs) => {
  const { script, argsDescriptor } = await importScript(name);
  const { _: args, ...options } = parseArgs(rawArgs, argsDescriptor);
  await script(options, ...args);
};

main(...process.argv.slice(2)).catch(err => {
  console.error(chalk.red(err.stack));
  process.exit(1);
});
