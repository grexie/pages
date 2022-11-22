import { Events, BuildContext } from '@grexie/pages-builder';
import { Configuration } from 'webpack';
import { createRequire } from 'module';

const require = createRequire(new URL(import.meta.url).pathname);
const extensions = ['.sass', '.scss'];

export default (context: Events<BuildContext>) => {
  context.builder.after('config', (config: Configuration) => {
    config.module?.rules?.push(
      {
        type: 'javascript/esm',
        test: /\.s[ac]ss$/,
        use: [
          context.builder.loader('@grexie/pages-cache-loader'),
          context.builder.loader('@grexie/pages-style-loader'),
          {
            loader: 'css-loader',
          },
          {
            loader: 'sass-loader',
          },
        ],
        include: /\.global\.s[ac]ss$/,
      },
      {
        type: 'javascript/esm',
        test: /\.s[ac]ss$/,
        use: [
          context.builder.loader('@grexie/pages-cache-loader'),
          context.builder.loader('@grexie/pages-style-loader'),
          {
            loader: 'css-loader',
            options: {
              modules: true,
            },
          },
          {
            loader: 'sass-loader',
          },
        ],
        include: /\.module\.s[ac]ss$/,
      }
    );
  });

  context.after('config', (context: BuildContext) => {
    for (const ext of extensions) {
      context.addEsmExtension(ext);
      context.addCompileExtension(ext);
    }
  });
};
