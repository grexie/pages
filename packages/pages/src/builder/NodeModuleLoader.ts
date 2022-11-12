import {
  InstantiatedModule,
  Module,
  ModuleLoader,
  vmContext,
} from './ModuleLoader.js';
import vm from 'vm';
import { createRequire, Module as NodeModule } from 'module';
import path from 'path';
import { isPlainObject } from '../utils/object.js';

export interface CommonJsModule extends InstantiatedModule {}

export class NodeModuleLoader extends ModuleLoader {
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
        context: vmContext,
      }
    );

    await vmModule.link(() => {});
    await vmModule.evaluate();

    return { ...module, vmModule, exports };
  }
}
