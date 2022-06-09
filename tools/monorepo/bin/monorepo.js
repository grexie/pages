#!/usr/bin/env node

const path = require('path');
const parseArgs = require('minimist');

require('ts-node').register({
  transpileOnly: false,
});

const importScript = name => {
  const module = require(path.resolve(__dirname, '..', 'src', 'scripts', name));

  return {
    script: module.default,
    argsDescriptor: module.args ?? {},
  };
};

const main = async (name, ...rawArgs) => {
  const { script, argsDescriptor } = importScript(name);
  const { _: args, ...options } = parseArgs(rawArgs, argsDescriptor);
  await script(options, ...args);
};

main(...process.argv.slice(2)).catch(err => {
  console.error(chalk.red(err));
  process.exit(1);
});
