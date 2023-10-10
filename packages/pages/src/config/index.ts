import {
  Configuration,
  LoaderDefinition,
  RuleSetRule,
  RuleSetUse,
} from 'webpack';
import { createRequire } from 'module';

const require = createRequire(process.cwd());

export type Plugin<C extends any = void> = (
  config: C,
  context: Omit<PagesConfig, 'plugins'>
) => (
  webpack: Configuration,
  context: { isServer: boolean; defaultLoaders: RuleSetUse }
) => Configuration | PromiseLike<Configuration>;

export type PluginConfig<C extends any> =
  | string
  | Plugin<C>
  | [plugin: string | Plugin<C>, config?: C];

export interface PagesConfig {
  pagesDir: string;
  plugins: PluginConfig<any>[];
}

const defaultPlugins: PluginConfig<any>[] = [];

export const withPages = async (
  webpack: Configuration,
  config: PagesConfig
) => {
  const context = {
    isServer: true,
    defaultLoaders: {
      babel: [
        { loader: 'swc-loader', options: { jsc: { parser: { jsx: true } } } },
      ],
    },
    config,
  };

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
      webpack = await m(plugin[1], config)(webpack, context as any);
    } else {
      webpack = await plugin[0](plugin[1], config)(webpack, context as any);
    }
  }
  return webpack;
};
