import { Events, BuildContext, Configuration } from '@grexie/pages-builder';
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
          context.builder.loader('@grexie/pages-cache-loader'),
          context.builder.loader('@grexie/pages-config-loader'),
          {
            loader: 'babel-loader',
            options: {
              presets: [
                '@babel/typescript',
                ['@babel/env', { modules: false }],
              ],
              sourceMaps: !!config.devtool,
            },
          },
        ],
      },
      {
        type: 'javascript/esm',
        test: /\.tsx?$/,
        use: [
          context.builder.loader('@grexie/pages-cache-loader'),
          context.builder.loader('@grexie/pages-module-loader'),
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
              plugins: config.devServer?.hot ? ['react-refresh/babel'] : [],
              sourceMaps: !!config.devtool,
            },
          },
        ],
      }
    );
  });

  context.after('config', (context: BuildContext) => {
    context.addSourceExtension(...extensions);
    context.addConfigExtension('.pages.ts');
    context.addResolveExtension(...extensions);
    context.addEsmExtension(...extensions);
    context.addCompileExtension(...extensions);
  });
};
