export default function CssPagesPlugin() {
  return function CssNextPlugin(config) {
    const nextConfigWebpack = config.webpack;
    config.webpack = function CssWebpackConfig(config, context) {
      config = nextConfigWebpack?.(config, context) ?? config;
      config.module?.rules?.unshift({
        type: 'javascript/esm',
        test: /\.css$/,
        use: ['@grexie/pages-style-loader', {
          loader: 'css-loader',
          options: {
            esModule: false,
            sourceMap: true
          }
        }]
      }, {
        type: 'javascript/esm',
        test: /\.css$/,
        use: ['@grexie/pages-style-loader', {
          loader: 'css-loader',
          options: {
            esModule: false,
            sourceMap: true
          }
        }],
        include: /\.global\.css$/
      }, {
        type: 'javascript/esm',
        test: /\.css$/,
        use: ['@grexie/pages-style-loader', {
          loader: 'css-loader',
          options: {
            esModule: false,
            modules: process.env.NODE_ENV === 'production' ? true : {
              localIdentName: '[path][name]__[local]--[hash:base64:5]'
            }
          }
        }],
        include: /\.module\.css$/
      });
      return config;
    };
    return config;
  };
}
//# sourceMappingURL=index.js.map