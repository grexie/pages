import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { createRequire } from 'module';

const __dirname = path.dirname(import.meta.url);

type Script = (...args: string[]) => Promise<void>;

const domains = [
  { domain: '@grexie/pages/scripts' },
  {
    domain: '@grexie/pages/scripts',
    parent: __dirname,
  },
  {
    domain: path.resolve(__dirname, './scripts/'),
    parent: __dirname,
  },
];

const importScript = async (name: string): Promise<Script> => {
  let module: string | undefined;

  for (const { domain, parent } of domains) {
    try {
      const modulePath = path.join(domain, name.replace(/:/g, '/'));
      module = await import.meta.resolve?.(modulePath, parent ?? process.cwd());
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
      const require = createRequire(process.cwd());
      const localModule = require.resolve('@grexie/pages-cli');
      if (fs.realpathSync(localModule) !== __filename) {
        const localPages = require(localModule);
        localPages.default();
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
    console.error();
    console.error(chalk.red(`command ${chalk.bold(name)} not found`));
    console.error();
    console.error(await usage());
    console.error();
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
