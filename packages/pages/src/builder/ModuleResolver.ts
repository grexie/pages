import { Compilation } from 'webpack';
import { BuildContext } from './BuildContext.js';

export interface ModuleResolverOptions {
  context: BuildContext;
  compilation: Compilation;
}

export class ModuleResolver {
  readonly context: BuildContext;
  readonly compilation: Compilation;

  constructor({ context, compilation }: ModuleResolverOptions) {
    this.context = context;
    this.compilation = compilation;
  }

  async resolve(context: string, request: string): Promise<string> {
    throw new Error('not implemented');
  }
}
