import vm from 'vm';
import type { InstantiatedModule, Module } from './ModuleLoader.js';
import { ModuleLoader, vmContext } from './ModuleLoader.js';

export interface EsmModule extends InstantiatedModule {
  readonly vmModule: vm.Module;
}

export class EsmModuleLoader extends ModuleLoader {
  async instantiate(module: Module): Promise<EsmModule> {
    const vmModule = new vm.SourceTextModule(module.source, {
      context: vmContext,
      initializeImportMeta: () => {},
      identifier: module.filename,
      importModuleDynamically: async request => {
        const childModule = await this.context.require(module.context, request);
        return childModule.vmModule;
      },
    });

    await vmModule.link(async (request: string) => {
      const childModule = await this.context.require(module.context, request);
      return childModule.vmModule;
    });

    await vmModule.evaluate({});
    return { ...module, vmModule };
  }
}
