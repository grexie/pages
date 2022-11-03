import * as _nodemon from 'nodemon';
import * as path from 'path';
import * as fs from 'fs';
import * as _chalk from 'chalk';
import { createRequire } from 'module';

const __dirname = path.dirname(new URL(import.meta.url).pathname);
const chalk = _chalk.default;
const nodemon = _nodemon.default;

export default () => {
  const require = createRequire(import.meta.url);

  const watch = [
    path.dirname(require.resolve('@grexie/pages/package.json')),
    path.dirname(require.resolve('@grexie/builder/package.json')),
  ];

  const options: _nodemon.Settings = {
    script: path.resolve(__dirname, '..', 'server', 'run'),
    ext: 'js jsx json',
    watch: watch.map(pathname => fs.realpathSync(pathname)),
    delay: 100,
  };

  nodemon(options);

  let processExit = true;
  nodemon
    .on('crash', function () {
      console.error(chalk.red('server crashed, waiting for file changes'));
    })
    .on('exit', function () {
      if (processExit) {
        console.error();
        process.exit(0);
      }
      processExit = true;
    })
    .on('restart', function (files: string[]) {
      processExit = false;
      console.error(chalk.red('server restarting due to file changes'));
    });
};
