import { Provider } from '../api/Provider';
import { Server } from './Server';
import 'source-map-support/register.js';

const server = new Server({
  port: Number(process.env.PORT ?? 3000),
  providers: [
    {
      provider: Provider,
    },
  ],
});

server.start().then(server => {
  const { port } = server.address() as any;
  console.error(`🚀 server listening at http://localhost:${port}`);
});
