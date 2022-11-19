import { Events, BuildContext } from '@grexie/pages-builder';
import { Configuration } from 'webpack';
import { createRequire } from 'module';

const require = createRequire(new URL(import.meta.url).pathname);
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
    context.addCompilationRoot(require.resolve('@grexie/pages-runtime-image'));

    for (const ext of extensions) {
      context.addEsmExtension(ext);
      context.addCompileExtension(ext);
    }
  });
};
