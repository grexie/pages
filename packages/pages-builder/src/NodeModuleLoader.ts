import { InstantiatedModule, Module, ModuleLoader } from './ModuleLoader.js';
import vm from 'vm';
import { isPlainObject } from '@grexie/is-plain-object';
import webpack from 'webpack';

export interface CommonJsModule extends InstantiatedModule {}

export class NodeModuleLoader extends ModuleLoader {
  protected async build(
    context: string,
    filename: string,
    webpackModule: webpack.Module
  ): Promise<InstantiatedModule> {
    throw new Error('not implemented');
  }

  async instantiate(module: Module): Promise<CommonJsModule> {
    const exports = await import(module.filename);

    const vmModule = new vm.SyntheticModule(
      [
        ...new Set([
          'default',
          ...(isPlainObject(exports) ? Object.keys(exports) : []),
        ]),
      ],
      function (this: any) {
        if (isPlainObject(exports)) {
          Object.keys(exports).forEach(name => {
            this.setExport(name, exports[name]);
          });
          if (!('default' in exports)) {
            this.setExport('default', exports);
          }
        } else {
          this.setExport('default', exports);
        }
      },
      {
        context: this.vmContext,
      }
    );

    await vmModule.link((() => {}) as any);
    await vmModule.evaluate();

    return { ...module, vmModule, exports };
  }

  async load(context: string, request: string): Promise<InstantiatedModule> {
    return this.instantiate({
      context,
      filename: request,
      source: '',
    });
  }

  async create(
    context: string,
    filename: string,
    source: string
  ): Promise<InstantiatedModule> {
    throw new Error('not implemented');
  }
}
