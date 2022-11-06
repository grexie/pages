import { Module, ModuleLoader } from './ModuleLoader.js';

export interface CommonJsModule extends Module {}

export class CommonJsModuleLoader extends ModuleLoader {
  async instantiate(module: Module): Promise<CommonJsModule> {
    throw new Error('not implemented');
  }
}
