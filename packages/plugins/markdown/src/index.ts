import { Events, BuildContext, Configuration } from '@grexie/pages-builder';
import { createRequire } from 'module';

const require = createRequire(new URL(import.meta.url).pathname);

const extensions = ['.md', '.mdx'];

export default (context: Events<BuildContext>) => {
  context.builder.after('config', (config: Configuration) => {
    config.module?.rules?.push({
      type: 'javascript/esm',
      test: /\.mdx?$/,
      exclude: /(node_modules|bower_components)/,
      use: [
        context.builder.loader('@grexie/pages-cache-loader'),
        context.builder.loader('@grexie/pages-module-loader', {
          handler: '@grexie/pages-plugin-markdown',
        }),
      ],
    });
  });

  context.after('config', (context: BuildContext) => {
    context.addSourceExtension(...extensions);
    context.addResolveExtension(...extensions);
    context.addEsmExtension(...extensions);
    context.addCompileExtension(...extensions);
  });
};
