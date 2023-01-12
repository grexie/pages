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
import webpack from 'webpack';

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
    const sources = new Set<Source>([]);
    let cachedSources: Record<string, Source> = {};
    const compiler = await this.context.builder.createCompiler(sources);

    this.#server = createResolver<http.Server>();

    const app = express();

    await this.#events.emit(EventPhase.before, 'routes', app, express);

    const devServer = WebpackDevMiddleware(compiler, {
      publicPath: compiler.options.output.publicPath,
      writeToDisk: false,
      serverSideRender: false,
      stats: 'errors-warnings',
    });

    app.use(async (req, res, next) => {
      if (!req.headers.accept?.split(/,/g).includes('text/html')) {
        next();
        return;
      }

      const handleStats = (
        stats: webpack.Stats | webpack.MultiStats | void
      ) => {
        if ((stats as webpack.MultiStats).hasErrors()) {
          devServer.invalidate(() => {
            setImmediate(() => {
              devServer.waitUntilValid(() => next());
            });
          });
        } else {
          next();
        }
      };

      devServer.waitUntilValid(async () => {
        try {
          let pathname = req.path;
          const slug = req.path.replace(/^\/|\/$/g, '').replace(/\/+/g, '/');
          let source: Source | undefined;
          try {
            source = await this.context.sources.getSource({
              path: slug.split(/\//g),
            });
          } catch (err) {
            req.url = '/404/';
            source = await this.context.sources.getSource({
              path: ['404'],
            });
          }

          if (
            source &&
            ![...sources].map(({ abspath }) => abspath).includes(source.abspath)
          ) {
            if (!pathname.endsWith('/')) {
              pathname += '/';
            }

            cachedSources[pathname] = source;
            process.stderr.write(
              chalk.whiteBright('compiling ') +
                chalk.cyan(source.abspath) +
                chalk.whiteBright('...\n')
            );
            sources.add(source);

            devServer.invalidate(() => {
              setImmediate(() => {
                devServer.waitUntilValid(handleStats);
              });
            });
          } else {
            setImmediate(() => {
              devServer.waitUntilValid(handleStats);
            });
          }
        } catch (err) {
          next(err);
        }
      });
    });

    app.use(devServer);

    if (process.env.WEBPACK_HOT === 'true') {
      const hot = WebpackHotMiddleware(compiler, {
        path: '/__webpack/hmr',
      });

      // compiler.hooks.afterCompile.tap('PagesServe', compilation => {
      //   if (compilation.errors.length) {
      //     setTimeout(() => {
      //       console.info('blocked', compiler.watching.blocked);
      //       console.info('closed', compiler.watching.closed);
      //       console.info('suspended', compiler.watching.suspended);
      //       console.info('files', compiler.watching.watcher?.)
      //       console.info(compiler.watching.resume());
      //     }, 4000);
      //   }
      // });

      compiler.hooks.compilation.tap('PagesServe', compilation => {
        compilation.hooks.afterProcessAssets.tap('PagesServe', async assets => {
          const pathnames: string[] = [];

          for (const pathname in cachedSources) {
            let source = cachedSources[pathname];

            let newSource: Source | undefined;
            try {
              newSource = await this.context.sources.getSource({
                path: pathname.split(/\//g).filter(x => !!x),
              });
            } catch (err) {
              newSource = await this.context.sources.getSource({
                path: ['404'],
              });
            }

            if (source.abspath !== newSource.abspath) {
              sources.delete(cachedSources[pathname]);
              sources.add(newSource);
              delete cachedSources[pathname];
              cachedSources[pathname] = newSource;
              pathnames.push(pathname);
            }
          }

          if (pathnames.length) {
            devServer.invalidate(() => {
              devServer.waitUntilValid(() => {
                hot.publish({ action: 'reload', pathnames });
              });
            });
          }
        });
      });

      app.use(hot);
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
