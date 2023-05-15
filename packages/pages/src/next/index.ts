import type { NextConfig } from 'next';

import { createRequire } from 'module';

const require = createRequire(process.cwd());

export type Plugin<C extends any = void> = (
  config: C
) => (nextConfig: NextConfig) => Promise<NextConfig>;

export type PluginConfig<C extends any> =
  | string
  | Plugin<C>
  | [plugin: string | Plugin<C>, config?: C];

export interface PagesConfig {
  plugins: PluginConfig<any>[];
}

export const withPages = async (
  nextConfig: NextConfig,
  config: PagesConfig
) => {
  for (let plugin of config.plugins) {
    if (!Array.isArray(plugin)) {
      plugin = [plugin];
    }

    if (typeof plugin[0] === 'string') {
      const loc = require.resolve(plugin[0]);
      let m: Plugin = await import(loc);
      if ((m as any).default) {
        m = (m as any).default;
      }
      nextConfig = await m(plugin[1])(nextConfig);
    } else {
      nextConfig = await plugin[0](plugin[1])(nextConfig);
    }
  }
  return nextConfig;
};
