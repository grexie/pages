import fs from 'fs';
import path from 'path';
import resolve from 'resolve';
import chalk from 'chalk';

type Script = (...args: string[]) => Promise<void>;

const domains = [
  { domain: '@grexie/pages/scripts' },
  {
    domain: '@grexie/pages/scripts',
    basedir: __dirname,
  },
  {
    domain: path.resolve(__dirname, './scripts/'),
    basedir: __dirname,
  },
];

const importScript = async (name: string): Promise<Script> => {
  let module: string | null = null;

  for (const { domain, ...options } of domains) {
    try {
      const modulePath = path.join(domain, name.replace(/:/g, '/'));
      module = resolve.sync(modulePath, {
        basedir: process.cwd(),
        ...options,
      });
      break;
    } catch (err) {
      continue;
    }
  }

  if (!module) {
    throw new Error();
  }

  const { default: script } = await import(module);
  return script;
};

const usage = async () => `${chalk.cyan.bold('Grexie Pages')}

usage: ${chalk.bold('pages COMMAND')}`;

const main = async (name: string, ...args: string[]) => {
  if (fs.existsSync('node_modules')) {
    try {
      const localModule = resolve.sync('@grexie/pages-cli', {
        basedir: process.cwd(),
      });
      if (fs.realpathSync(localModule) !== __filename) {
        const localPages = require(localModule).default;
        localPages();
        return;
      }
    } catch (err) {}
  }

  if (!name) {
    console.error(await usage());
    process.exit(1);
  }

  let script: Script;

  try {
    script = await importScript(name);
  } catch (err) {
    console.info(err);
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
