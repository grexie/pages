import { Events, BuildContext, Configuration } from '@grexie/pages-builder';
export type { StyleSheet } from '@grexie/pages-runtime-styles';

const extensions = ['.sass', '.scss'];

export default (context: Events<BuildContext>) => {
  context.builder.after('config', (config: Configuration) => {
    config.module?.rules?.push(
      {
        type: 'javascript/esm',
        test: /\.css$/,
        use: [
          context.builder.loader('@grexie/pages-cache-loader'),
          context.builder.loader('@grexie/pages-style-loader'),
          'thread-loader',
          {
            loader: 'css-loader',
          },
        ],
        include: /\.global\.css$/,
      },
      {
        type: 'javascript/esm',
        test: /\.s[ac]ss$/,
        use: [
          context.builder.loader('@grexie/pages-cache-loader'),
          context.builder.loader('@grexie/pages-style-loader'),
          'thread-loader',
          {
            loader: 'css-loader',
            options: {
              modules: true,
            },
          },
        ],
        include: /\.module\.css$/,
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
