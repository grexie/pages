import { Events, BuildContext, Configuration } from '@grexie/pages-builder';

const extensions = ['.json'];

export default (context: Events<BuildContext>) => {
  context.builder.after('config', (config: Configuration) => {
    config.module?.rules?.push(
      {
        type: 'javascript/esm',
        test: /(^\.?|\/\.?)pages\.json$/,
        use: [
          context.builder.loader('@grexie/pages-config-loader'),
          context.builder.loader('@grexie/pages-json-loader'),
        ],
      },
      {
        type: 'javascript/esm',
        test: /\.json$/,
        use: [context.builder.loader('@grexie/pages-json-loader')],
        exclude: [/(^\.?|\/\.?|\.)pages\.json$/],
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
