export default function SvgPagesPlugin() {
  return function SvgNextPlugin(config) {
    const nextConfigWebpack = config.webpack;
    config.webpack = function SvgWebpackConfig(config, context) {
      config = nextConfigWebpack?.(config, context) ?? config;
      const fileLoaderRule = config.module?.rules?.find(rule => rule.test?.test?.('.svg'));
      config.module?.rules?.push({
        ...fileLoaderRule,
        test: /\.svg$/i,
        resourceQuery: /url/
      }, {
        test: /\.svg$/i,
        issuer: /\.([jt]sx?|mdx?)$/,
        resourceQuery: {
          not: /url/
        },
        use: ['@svgr/webpack']
      });
      if (fileLoaderRule) {
        fileLoaderRule.exclude = /\.svg$/i;
      }
      return config;
    };
    return config;
  };
}
//# sourceMappingURL=index.js.map