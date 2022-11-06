import { InstantiatedModule, Module, ModuleLoader } from './ModuleLoader.js';

export interface CommonJsModule extends InstantiatedModule {}

export class CommonJsModuleLoader extends ModuleLoader {
  async instantiate(module: Module): Promise<CommonJsModule> {
    throw new Error('not implemented');
  }
}
