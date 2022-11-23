import { Events, BuildContext } from '@grexie/pages-builder';
import { Configuration } from 'webpack';
import { createRequire } from 'module';

const require = createRequire(new URL(import.meta.url).pathname);

const extensions = ['.js', '.jsx', '.mjs', '.cjs'];

export default (context: Events<BuildContext>) => {
  context.builder.after('config', (config: Configuration) => {
    config.module?.rules?.push(
      {
        type: 'javascript/esm',
        test: /\.pages\.([mc]?js)$/,
        use: [
          this.loader('@grexie/pages-cache-loader'),
          this.loader('@grexie/pages-config-loader'),
          {
            loader: 'babel-loader',
            options: {
              presets: [['@babel/env', { modules: false }]],
              cwd: this.context.pagesDir,
              root: this.context.rootDir,
            },
          },
        ],
      },
      {
        type: 'javascript/esm',
        test: /\.jsx?$/,
        use: [
          this.loader('@grexie/pages-cache-loader'),
          this.loader('@grexie/pages-module-loader'),
          {
            loader: 'babel-loader',
            options: {
              presets: [
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
              sourceMaps: true,
            },
          },
        ],
      }
    );
  });

  context.after('config', (context: BuildContext) => {
    context.addResolveExtension(...extensions);
    context.addCompileExtension('.jsx');
    context.addEsmExtension('.mjs');
    context.addCompilationRoot(pages.rootDir);
  });
};
