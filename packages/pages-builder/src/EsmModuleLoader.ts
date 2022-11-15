import vm from 'vm';
import type { InstantiatedModule, Module } from './ModuleLoader.js';
import { ModuleLoader, vmContext } from './ModuleLoader.js';

export class EsmModuleLoader extends ModuleLoader {
  protected async instantiate(module: Module): Promise<InstantiatedModule> {
    const vmModule = new vm.SourceTextModule(module.source, {
      context: vmContext,
      initializeImportMeta: () => {},
      identifier: module.filename,
      importModuleDynamically: async request => {
        const childModule = await this.context.requireModule(
          module.context,
          request
        );
        return childModule.vmModule;
      },
    });

    await vmModule.link(async (request: string) => {
      const childModule = await this.context.requireModule(
        module.context,
        request
      );
      return childModule.vmModule;
    });

    await vmModule.evaluate({});

    return { ...module, vmModule, exports: vmModule.namespace };
  }
}