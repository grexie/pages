import http from 'http';
import {
  Stats,
  RootBuildContext,
  BuildContextOptions,
  EventManager,
  EventPhase,
  Source,
} from '@grexie/pages-builder';
import { ResolvablePromise, createResolver } from '@grexie/resolvable';
import WebpackHotMiddleware from 'webpack-hot-middleware';
import WebpackDevMiddleware from 'webpack-dev-middleware';
import express from 'express';
import path from 'path';
import chalk from 'chalk';

export interface ServerOptions extends BuildContextOptions {
  port?: number;
}

const defaultOptions = (): Partial<ServerOptions> => ({
  port: Number(process.env.PORT ?? 3000),
});

interface ServerContextOptions extends ServerOptions {
  server: Server;
}

export class ServerContext extends RootBuildContext {
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
  readonly #events = EventManager.get<Server>(this);

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

    await this.context.ready;
    const initialSources = await this.context.registry.list({ slug: '' });
    const sources = new Set<Source>(initialSources);
    const compiler = await this.context.builder.createCompiler(sources);

    this.#server = createResolver<http.Server>();
    // const handler = new RequestHandler(this.context);
    const app = express();

    await this.#events.emit(EventPhase.before, 'routes', app);

    const devServer = WebpackDevMiddleware(compiler, {
      publicPath: compiler.options.output.publicPath,
      writeToDisk: false,
      serverSideRender: false,
      stats: 'errors-warnings',
    });

    app.use(async (req, res, next) => {
      try {
        const slug = req.path.replace(/^\/|\/$/g, '').replace(/\/+/g, '/');
        const source = await this.context.registry.get({
          slug,
        });
        if (source && !sources.has(source)) {
          process.stderr.write(
            chalk.whiteBright('compiling ') +
              chalk.cyan(source.filename) +
              chalk.whiteBright('...\n')
          );
          sources.clear();
          sources.add(source);

          devServer.invalidate(() => {
            setImmediate(() => {
              devServer.waitUntilValid(() => next());
            });
          });
        } else {
          devServer.waitUntilValid(() => next());
        }
      } catch (err) {
        next(err);
      }
    });

    app.use(devServer);

    if (process.env.WEBPACK_HOT === 'true') {
      app.use(
        WebpackHotMiddleware(compiler, {
          path: '/__webpack/hmr',
        })
      );
    }
    await this.#events.emit(EventPhase.after, 'routes', app, express);

    const server = http.createServer(app);
    server.listen(this.context.port, () => {
      // const { port } = server.address() as any;
      // console.error(`🚀 server listening at http://localhost:${port}`);
      this.#server?.resolve(server);
    });
    return this.#server;
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
