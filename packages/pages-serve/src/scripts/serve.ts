import nodemon from 'nodemon';
import * as path from 'path';
import * as fs from 'fs';
import chalk from 'chalk';
import { createRequire } from 'module';
import {
  PluginContext,
  defaultDescriptionFileData,
  FileSystem,
} from '@grexie/pages-builder';
import { Volume } from 'memfs';

const __dirname = path.dirname(new URL(import.meta.url).pathname);

export default async () => {
  const volume = new Volume();
  volume.mkdirSync(process.cwd(), { recursive: true });
  volume.writeFileSync(
    path.resolve(process.cwd(), 'package.json'),
    JSON.stringify(defaultDescriptionFileData, null, 2)
  );
  const fileSystem = new FileSystem().add('/', fs).add(process.cwd(), volume);

  const context = await PluginContext.create(
    fileSystem,
    path.resolve(process.cwd(), 'package.json')
  );

  const require = createRequire(import.meta.url);

  const watch = [
    path.dirname(require.resolve('@grexie/pages/package.json')),
    path.dirname(require.resolve('@grexie/pages-builder/package.json')),
    ...[...context.plugins].map(({ path }) => path),
  ];

  const options: nodemon.Settings = {
    script: path.resolve(__dirname, '..', 'run'),
    ext: 'js jsx json',
    watch: watch.map(pathname => fs.realpathSync(pathname)),
    delay: 100,
    env: {
      ...process.env,
      WEBPACK_HOT: 'true',
    },
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
