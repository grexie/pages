import http from 'http';
import type { Stats } from '@grexie/builder/FileSystem.js';
import { BuildContext, BuildContextOptions } from '../builder/BuildContext.js';
import { ResolvablePromise, createResolver } from '../utils/resolvable.js';
import { RequestHandler } from './RequestHandler.js';
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

    let sources = await this.context.registry.list();
    const compiler = await this.context.builder.compiler(sources);

    this.#server = createResolver<http.Server>();
    const handler = new RequestHandler(this.context);
    const app = express();

    app.use(
      WebpackDevMiddleware(compiler, {
        publicPath: compiler.options.output.publicPath,
        writeToDisk: true,
        serverSideRender: true,
      })
    );
    app.use(
      WebpackHotMiddleware(compiler, {
        path: '/__webpack/hmr',
      })
    );
    // app.use(handler.handle);

    const server = http.createServer(app);
    server.listen(this.context.port, () => {
      this.#server?.resolve(server);
    });
    return this.#server;
  }

  async #watch(): Promise<void> {
    let resources = await this.context.registry.list();
    const watcher = await this.context.builder.watch(resources);
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
