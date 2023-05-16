import type { NextConfig } from 'next';
import { PagesInfrastructurePlugin } from './plugin.js';
import { createRequire } from 'module';

const require = createRequire(process.cwd());

export type Plugin<C extends any = void> = (
  config: C,
  context: Omit<PagesConfig, 'plugins'>
) => (nextConfig: NextConfig) => NextConfig | PromiseLike<NextConfig>;

export type PluginConfig<C extends any> =
  | string
  | Plugin<C>
  | [plugin: string | Plugin<C>, config?: C];

export interface PagesConfig {
  pagesDir: string;
  plugins: PluginConfig<any>[];
}

const defaultPlugins: PluginConfig<any>[] = [PagesInfrastructurePlugin];

export const withPages = async (
  nextConfig: NextConfig,
  config: PagesConfig
) => {
  for (let plugin of [...defaultPlugins, ...config.plugins]) {
    if (!Array.isArray(plugin)) {
      plugin = [plugin];
    }

    if (typeof plugin[0] === 'string') {
      const loc = require.resolve(plugin[0]);
      let m: Plugin = await import(loc);
      if ((m as any).default) {
        m = (m as any).default;
      }
      nextConfig = await m(plugin[1], config)(nextConfig);
    } else {
      nextConfig = await plugin[0](plugin[1], config)(nextConfig);
    }
  }
  return nextConfig;
};
