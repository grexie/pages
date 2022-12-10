import { Events, BuildContext, Configuration } from '@grexie/pages-builder';
import { createRequire } from 'module';

const require = createRequire(new URL(import.meta.url).pathname);

const extensions = ['.yaml', '.yml'];

export default (context: Events<BuildContext>) => {
  context.builder.after('config', (config: Configuration) => {
    config.module?.rules?.push(
      {
        type: 'javascript/esm',
        test: /(^\.?|\/\.?)pages.ya?ml$/,
        use: [
          // context.builder.loader('@grexie/pages-cache-loader'),
          context.builder.loader('@grexie/pages-config-loader'),
          context.builder.loader('@grexie/pages-yaml-loader'),
        ],
      },
      {
        type: 'javascript/esm',
        test: /\.ya?ml$/,
        use: [
          // context.builder.loader('@grexie/pages-cache-loader'),
          context.builder.loader('@grexie/pages-yaml-loader'),
        ],
        exclude: [/(^\.?|\/\.?|\.)pages.ya?ml$/],
      }
    );
  });

  context.after('config', (context: BuildContext) => {
    context.addConfigExtension(
      ...extensions.map(extname => `.pages${extname}`)
    );
    context.addEsmExtension(...extensions);
    context.addCompileExtension(...extensions);
  });
};
