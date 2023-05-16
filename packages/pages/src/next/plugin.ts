import { NextConfig } from 'next';
import { Plugin } from './index.js';
import { Configuration } from 'webpack';

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
