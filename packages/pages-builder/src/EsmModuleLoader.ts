import vm from 'vm';
import type { InstantiatedModule, Module } from './ModuleLoader.js';
import { ModuleLoader } from './ModuleLoader.js';

export class EsmModuleLoader extends ModuleLoader {
  protected async instantiate(module: Module): Promise<InstantiatedModule> {
    const vmModule = new vm.SourceTextModule(module.source, {
      context: this.vmContext,
      initializeImportMeta: () => {},
      identifier: module.filename,
      importModuleDynamically: (async (request: string) => {
        const childModule = await this.context.requireModule(
          module.context,
          request
        );
        return childModule.vmModule;
      }) as any,
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
