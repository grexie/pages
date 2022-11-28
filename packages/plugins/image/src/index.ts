import { Events, BuildContext, Configuration } from '@grexie/pages-builder';
export type { Image } from '@grexie/pages-runtime-image';

const extensions = ['.jpeg', '.jpg', '.png', '.webp', '.gif', '.svg'];

export default (context: Events<BuildContext>) => {
  context.builder.after('config', (config: Configuration) => {
    config.module?.rules?.push({
      type: 'javascript/esm',
      test: /\.(png|jpe?g|gif|webp|svg)$/,
      use: [
        context.builder.loader('@grexie/pages-cache-loader'),
        context.builder.loader('@grexie/pages-image-loader'),
        'raw-loader',
      ],
    });
  });

  context.after('config', (context: BuildContext) => {
    for (const ext of extensions) {
      context.addEsmExtension(ext);
      context.addCompileExtension(ext);
    }
  });
};
