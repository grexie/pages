import type { BuildContext } from '../BuildContext.js';
import type { PluginHandler } from '../PluginContext.js';
import type { Events } from '../EventManager.js';
import CopyWebpackPlugin from 'copy-webpack-plugin';
import path from 'path';

interface ServerContext extends BuildContext {
  readonly server: Server;
}

interface Server {}

export const StaticFilesPlugin: PluginHandler = context => {
  context.after('config', () => {
    context.addExcludeGlob('static/**');
  });

  if (!context.isServer) {
    context.builder.after('config', config => {
      config.plugins.push(
        new CopyWebpackPlugin({
          patterns: [
            {
              from: path.resolve(context.rootDir, 'static'),
              to: path.resolve(context.outputDir),
              noErrorOnMissing: true,
            },
          ],
        })
      );
    });
  } else {
    (context as Events<ServerContext>).server.after(
      'routes',
      (app, express) => {
        app.use('/', express.static(path.resolve(context.rootDir, 'static')));
      }
    );
  }
};
