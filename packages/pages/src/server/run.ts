import { Provider } from '../api/Provider';
import { Server } from './Server';
import fs from 'fs';
import path from 'path';
import 'source-map-support/register.js';

const server = new Server({
  port: Number(process.env.PORT ?? 3000),
  providers: [
    {
      provider: Provider,
    },
  ],
  fs,
});

server.context.fs.add(path.resolve(server.context.rootDir, 'build'), fs, true);

server.start().then(server => {
  const { port } = server.address() as any;
  console.error(`🚀 server listening at http://localhost:${port}`);
});
