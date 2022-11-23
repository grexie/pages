import { Events, BuildContext } from '@grexie/pages-builder';
import { Configuration } from 'webpack';
import { createRequire } from 'module';

const require = createRequire(new URL(import.meta.url).pathname);

const extensions = ['.ts', '.tsx'];

export default (context: Events<BuildContext>) => {
  context.builder.after('config', (config: Configuration) => {
    config.module?.rules?.push(
      {
        type: 'javascript/esm',
        test: /\.pages\.ts$/,
        use: [
          this.loader('@grexie/pages-cache-loader'),
          this.loader('@grexie/pages-config-loader'),
          {
            loader: 'babel-loader',
            options: {
              presets: [
                '@babel/typescript',
                ['@babel/env', { modules: false }],
              ],
            },
          },
        ],
      },
      {
        type: 'javascript/esm',
        test: /\.tsx?$/,
        use: [
          this.loader('@grexie/pages-cache-loader'),
          this.loader('@grexie/pages-module-loader'),
          {
            loader: 'babel-loader',
            options: {
              presets: [
                '@babel/typescript',
                ['@babel/react', { runtime: 'automatic' }],
                [
                  '@babel/env',
                  {
                    targets: 'node 16',
                    modules: false,
                  },
                ],
              ],
              plugins: hot ? ['react-refresh/babel'] : [],
              cwd: context.rootDir,
              root: context.rootDir,
              sourceMaps: true,
            },
          },
        ],
      }
    );
  });

  context.after('config', (context: BuildContext) => {
    context.addResolveExtension(...extensions);
    context.addEsmExtension(...extensions);
    context.addCompileExtension(...extensions);
  });
};
