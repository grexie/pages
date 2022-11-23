import { StaticFilesPlugin } from './StaticFilesPlugin.js';

const plugins = [StaticFilesPlugin];

export default async context => {
  await Promise.all(plugins.map(plugin => plugin(context)));
};
