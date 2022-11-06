import vm from 'vm';
import { Module, ModuleLoader, vmContext } from './ModuleLoader.js';

export interface EsmModule extends Module {
  readonly vmModule: vm.Module;
}

export class EsmModuleLoader extends ModuleLoader {
  async instantiate(module: Module): Promise<EsmModule> {
    const vmModule = new vm.SourceTextModule(module.source, {
      context: vmContext,
      initializeImportMeta: () => {},
      identifier: module.filename,
      importModuleDynamically: async specified => {
        const m = await this.require(factory, context, specified);
        await m.load();
        return m.module;
      },
    });

    await sourceTextModule.link((async (specifier: string) => {
      const { [specifier]: resolved } = await this.resolver.resolve(
        factory,
        context,
        specifier
      );

      let modulePromise = this.modules[resolved?.filename ?? specifier];

      if (modulePromise) {
        const module = await modulePromise;
        await module.load();
        return module.module;
      }

      const resolver = createResolver<Module>();
      this.modules[resolved?.filename ?? specifier] = resolver;

      const syntheticModule = await this.#createSyntheticModule(
        factory,
        context,
        filename,
        specifier
      );

      const ready = createResolver();
      const module = new Module({
        context: this,
        filename: resolved.filename,
        loader: () => Promise.resolve(syntheticModule),
        imports: {},
        stats: { mtime: new Date(0), mtimeMs: 0 } as any,
        webpackModule: null as any,
        ready,
      });

      await ready;
      this.loadedModules[filename] = module;

      resolver.resolve(module);
      return syntheticModule;
    }) as any);

    await sourceTextModule.evaluate({});
    return sourceTextModule;
  }
}
