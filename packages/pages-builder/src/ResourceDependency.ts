import EntryDependency from 'webpack/lib/dependencies/EntryDependency.js';
import webpack from 'webpack';
import type { BuildContext } from './BuildContext.js';
import type { Source } from './Source.js';

export interface ResourceDependencyOptions {
  request: string;
  context: BuildContext;
  source: Source;
}

export class ResourceDependency extends EntryDependency {
  readonly context: BuildContext;
  readonly source: Source;

  constructor({ request, context, source }: ResourceDependencyOptions) {
    super(request);
    this.context = context;
    this.source = source;
  }
}

export const getModuleDependency = (
  compilation: webpack.Compilation,
  module: webpack.Module
): webpack.Dependency | undefined => {
  for (const entry of compilation.entries.values()) {
    for (const dependency of entry.dependencies.values()) {
      if (compilation.moduleGraph.getModule(dependency) === module) {
        return dependency;
      }
    }
  }
};
