import { Events, BuildContext, Configuration } from '@grexie/pages-builder';
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
          context.builder.loader('@grexie/pages-cache-loader'),
          context.builder.loader('@grexie/pages-ssr-loader'),
          '@grexie/pages-config-loader',
          {
            loader: 'babel-loader',
            options: {
              presets: [['@babel/env', { modules: false }]],
              sourceMaps: !!config.devtool,
              compact: false,
            },
          },
        ],
      },
      {
        type: 'javascript/esm',
        test: /\.jsx?$/,
        include: [(filename: string) => context.sources.isRootDir(filename)],
        use: [
          context.builder.loader('@grexie/pages-cache-loader'),
          context.builder.loader('@grexie/pages-ssr-loader'),
          context.builder.loader('@grexie/pages-module-loader'),
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
              plugins: config.devServer?.hot ? ['react-refresh/babel'] : [],
              sourceMaps: !!config.devtool,
              compact: false,
            },
          },
        ],
      },
      {
        type: 'javascript/auto',
        test: /\.(js|jsx|mjs|cjs)$/,
        exclude: [(filename: string) => context.sources.isRootDir(filename)],
        use: ['@grexie/pages-ssr-loader'],
      }
    );
  });

  context.after('config', (context: BuildContext) => {
    context.addSourceExtension('.js', '.jsx');
    context.addConfigExtension('.pages.js', '.pages.mjs', '.pages.cjs');
    context.addResolveExtension(...extensions);
    context.addCompileExtension(
      '.jsx',
      '.pages.js',
      '.pages.mjs',
      '.pages.cjs'
    );
    context.addEsmExtension('.jsx', '.mjs');
    context.addCompilationRoot(context.rootDir);
  });
};
