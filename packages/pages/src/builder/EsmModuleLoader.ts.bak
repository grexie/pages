import vm from 'vm';
import { createResolver } from '../utils/resolvable.js';
import type { InstantiatedModule, Module } from './ModuleLoader.js';
import { ModuleLoader, vmContext } from './ModuleLoader.js';

export interface EsmModule extends InstantiatedModule {
  readonly vmModule: vm.Module;
}

export class EsmModuleLoader extends ModuleLoader {
  async instantiate(module: Module): Promise<EsmModule> {
    if (this.modules[module.filename]) {
      return this.modules[module.filename]! as Promise<EsmModule>;
    }

    const resolver = createResolver<EsmModule>();
    this.modules[module.filename] = resolver;

    try {
      const vmModule = new vm.SourceTextModule(module.source, {
        context: vmContext,
        initializeImportMeta: () => {},
        identifier: module.filename,
        importModuleDynamically: async request => {
          const childModule = await this.context.require(
            module.context,
            request
          );
          return childModule.vmModule;
        },
      });

      await vmModule.link(async (request: string) => {
        const childModule = await this.context.require(module.context, request);
        return childModule.vmModule;
      });

      await vmModule.evaluate({});

      const instantiatedModule = { ...module, vmModule };
      resolver.resolve(instantiatedModule);
    } catch (err) {
      resolver.reject(err);
    } finally {
      return resolver;
    }
  }
}
