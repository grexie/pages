export default function SassPagesPlugin() {
  return function SassNextPlugin(config) {
    const nextConfigWebpack = config.webpack;
    config.webpack = function SassWebpackConfig(config, context) {
      config = nextConfigWebpack?.(config, context) ?? config;
      config.module?.rules?.unshift({
        type: 'javascript/esm',
        test: /\.s[ac]ss$/,
        use: ['@grexie/pages-style-loader', {
          loader: 'css-loader',
          options: {
            esModule: false,
            sourceMap: true
          }
        }, {
          loader: 'sass-loader'
        }],
        include: /\.global\.s[ac]ss$/
      }, {
        type: 'javascript/esm',
        test: /\.s[ac]ss$/,
        use: ['@grexie/pages-style-loader', {
          loader: 'css-loader',
          options: {
            esModule: false,
            modules: process.env.NODE_ENV === 'production' ? true : {
              localIdentName: '[path][name]__[local]--[hash:base64:5]'
            }
          }
        }, {
          loader: 'sass-loader'
        }],
        include: /\.module\.s[ac]ss$/
      });
      return config;
    };
    return config;
  };
}
//# sourceMappingURL=index.js.map