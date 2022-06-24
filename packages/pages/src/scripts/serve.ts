import nodemon from 'nodemon';
import resolve from 'resolve';
import path from 'path';
import fs from 'fs';
import chalk from 'chalk';

export default () => {
  const watch = [
    path.dirname(require.resolve('@grexie/pages/package.json')),
    path.dirname(require.resolve('@grexie/builder/package.json')),
  ];

  const options: nodemon.Settings = {
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
