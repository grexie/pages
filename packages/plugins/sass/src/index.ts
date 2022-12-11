import { Events, BuildContext, Configuration } from '@grexie/pages-builder';
export type { StyleSheet } from '@grexie/pages-runtime-styles';

const extensions = ['.sass', '.scss'];

export default (context: Events<BuildContext>) => {
  context.builder.after('config', (config: Configuration) => {
    config.module?.rules?.push(
      {
        type: 'javascript/esm',
        test: /\.s[ac]ss$/,
        use: [
          // context.builder.loader('@grexie/pages-cache-loader'),
          context.builder.loader('@grexie/pages-style-loader'),
          {
            loader: 'css-loader',
            options: {
              sourceMap: true,
            },
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
          // context.builder.loader('@grexie/pages-cache-loader'),
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
