import { Events, BuildContext } from '@grexie/pages-builder';
import { Configuration } from 'webpack';
import { createRequire } from 'module';

const require = createRequire(new URL(import.meta.url).pathname);

const extensions = ['.yaml'];

export default (context: Events<BuildContext>) => {
  context.builder.after('config', (config: Configuration) => {
    config.module?.rules?.push(
      {
        type: 'javascript/esm',
        test: /(^\.?|\/\.?|\.)pages.ya?ml$/,
        use: [
          this.loader('@grexie/pages-cache-loader'),
          this.loader('@grexie/pages-config-loader'),
          this.loader('@grexie/pages-yaml-loader'),
        ],
      },
      {
        type: 'javascript/esm',
        test: /\.ya?ml$/,
        use: [
          this.loader('@grexie/pages-cache-loader'),
          this.loader('@grexie/pages-yaml-loader'),
        ],
        exclude: [/(^\.?|\/\.?|\.)pages.ya?ml$/],
      }
    );
  });

  context.after('config', (context: BuildContext) => {
    context.addEsmExtension('.yaml');
    context.addCompileExtension('.yaml', '.pages.yaml', '.pages.yml');
  });
};
