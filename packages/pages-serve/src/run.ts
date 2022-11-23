import { Provider } from '@grexie/pages-builder';
import { Server } from './Server.js';
import fs from 'fs';
import path from 'path';
import 'source-map-support/register.js';

const server = new Server({
  port: Number(process.env.PORT ?? 3000),
  providers: [
    {
      provider: Provider,
      exclude: ['assets/**'],
    },
  ],
  fs,
});
server.context.fs.add(path.resolve(server.context.rootDir, 'build'), fs, true);

server.start();
