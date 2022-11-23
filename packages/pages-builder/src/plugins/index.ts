import type { BuildContext } from '../BuildContext.js';
import type { Events } from '../EventManager.js';
import { StaticFilesPlugin } from './StaticFilesPlugin.js';

const plugins = [StaticFilesPlugin];

export default async (context: Events<BuildContext>) => {
  await Promise.all(plugins.map(plugin => plugin(context)));
};
