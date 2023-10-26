import type { NextConfig } from 'next';
import type { Plugin } from './index.js';
import type { Configuration } from 'webpack';

export const PagesInfrastructurePlugin: Plugin = () => (config: NextConfig) => {
  const nextWebpackConfig = config.webpack;

  config.webpack = (config: Configuration, context: any) => {
    config.infrastructureLogging = config.infrastructureLogging ?? {};
    config.infrastructureLogging.level = 'error';
    nextWebpackConfig?.(config, context);
    return config;
  };

  return config;
};
