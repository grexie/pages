import http from 'http';
import { Stats } from '@grexie/pages-builder';
import { BuildContext, BuildContextOptions } from '@grexie/pages-builder';
import { ResolvablePromise, createResolver } from '@grexie/resolvable';
import WebpackHotMiddleware from 'webpack-hot-middleware';
import WebpackDevMiddleware from 'webpack-dev-middleware';
import express from 'express';

export interface ServerOptions extends BuildContextOptions {
  port?: number;
}

const defaultOptions = (): Partial<ServerOptions> => ({
  port: Number(process.env.PORT ?? 3000),
});

interface ServerContextOptions extends ServerOptions {
  server: Server;
}

export class ServerContext extends BuildContext {
  readonly server: Server;

  readonly port: number;

  readonly isRuntime: boolean = false;
  readonly isServer: boolean = true;

  constructor(options: ServerContextOptions) {
    const { server, port, ...opts } = Object.assign(defaultOptions(), options);
    super(opts);
    this.server = server;
    this.port = port!;
  }
}

export class Server {
  readonly context: ServerContext;
  #server: ResolvablePromise<http.Server> | null = null;

  constructor(options: ServerOptions) {
    this.context = new ServerContext({ server: this, ...options });
  }

  get httpServer() {
    return Promise.resolve(this.#server);
  }

  async start() {
    if (this.#server) {
      throw new Error('already started');
    }

    const compiler = await this.context.builder.compiler();

    this.#server = createResolver<http.Server>();
    // const handler = new RequestHandler(this.context);
    const app = express();

    app.use(
      WebpackDevMiddleware(compiler, {
        publicPath: compiler.options.output.publicPath,
        writeToDisk: false,
        serverSideRender: false,
        stats: 'errors-warnings',
      })
    );
    if (process.env.WEBPACK_HOT === 'true') {
      app.use(
        WebpackHotMiddleware(compiler, {
          path: '/__webpack/hmr',
        })
      );
    }

    const server = http.createServer(app);
    server.listen(this.context.port, () => {
      // const { port } = server.address() as any;
      // console.error(`🚀 server listening at http://localhost:${port}`);
      this.#server?.resolve(server);
    });
    return this.#server;
  }

  async #watch(): Promise<void> {
    const watcher = await this.context.builder.watch();
    watcher.on('build', (err: Error | null | undefined, stats?: Stats) => {
      if (err) {
        console.error(err);
        return;
      }

      console.info((stats as any).toString({ colors: true }));
    });
  }

  async stop() {
    const server = await this.#server;
    this.#server = null;
    return new Promise<void>((resolve, reject) =>
      server?.close(err => {
        if (err) {
          reject(err);
          return;
        }

        resolve();
      })
    );
  }

  async restart() {
    await this.stop();
    return this.start();
  }
}