import fs from 'fs';
import { sync as resolve } from 'resolve';
import chalk from 'chalk';

type Script = (...args: string[]) => Promise<void>;

const importScript = (name: string): Script => {
  const module = resolve(`./scripts/${name.replace(/:/g, '/')}`, {
    basedir: __dirname,
  });
  return require(module).default;
};

const usage = async () => `${chalk.cyan.bold('Grexie Pages')}

usage: ${chalk.bold('pages COMMAND')}`;

const main = async (name: string, ...args: string[]) => {
  if (fs.existsSync('node_modules')) {
    try {
      const module = resolve('@grexie/pages-cli', { basedir: process.cwd() });
      if (fs.realpathSync(module) !== __filename) {
        const localPages = require(module).default;
        localPages();
      }
    } catch (err) {}
  }

  if (!name) {
    console.error(await usage());
    process.exit(1);
  }

  let script: Script;

  try {
    script = importScript(name);
  } catch (err) {
    console.error(chalk.red(`command ${chalk.bold(name)} not found`));
    console.error();
    console.error(await usage());
    process.exit(1);
  }

  await script(...args);
};

const [name, ...args] = process.argv.slice(2);

const run = () =>
  main(name, ...args).catch(err => {
    console.error(err);
    process.exit(1);
  });

export default run;

if ((module = require.main)) {
  run();
}
