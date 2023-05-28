import { NextConfig } from 'next';
import { Configuration, RuleSetRule } from 'webpack';

export default function SvgPagesPlugin() {
  return function SvgNextPlugin(config: NextConfig) {
    const nextConfigWebpack = config.webpack;

    config.webpack = function SvgWebpackConfig(
      config: Configuration,
      context: any
    ) {
      config = nextConfigWebpack?.(config, context) ?? config;

      const fileLoaderRule = config.module?.rules?.find<RuleSetRule>(((
        rule: RuleSetRule
      ) => (rule.test as RegExp)?.test?.('.svg')) as any);

      config.module?.rules?.push(
        {
          ...fileLoaderRule,
          test: /\.svg$/i,
          resourceQuery: /url/,
        },
        {
          test: /\.svg$/i,
          resourceQuery: /icon/,
          use: [
            {
              loader: '@svgr/webpack',
              options: {
                icon: true,
              },
            },
          ],
        },
        {
          test: /\.svg$/i,
          resourceQuery: { not: [/url/, /icon/] },
          use: ['@svgr/webpack'],
        }
      );

      if (fileLoaderRule) {
        fileLoaderRule.exclude = /\.svg$/i;
      }

      return config;
    };
    return config;
  };
}
