import { InstantiatedModule, Module, ModuleLoader } from './ModuleLoader.js';
import vm from 'vm';
import { createRequire, Module as NodeModule } from 'module';
import path from 'path';
import { isPlainObject } from '@grexie/is-plain-object';
import { ModuleReference } from './ModuleResolver.js';

export interface CommonJsModule extends InstantiatedModule {}

type WrappedScript = (
  exports: any,
  require: NodeJS.Require,
  module: NodeModule,
  __filename: string,
  __dirname: string
) => void;

const wrapScript = (code: string): string =>
  `(exports, require, module, __filename, __dirname) => {\n${code}\n}`;

export class CommonJsModuleLoader extends ModuleLoader {
  async instantiate(module: Module): Promise<CommonJsModule> {
    const script = new vm.Script(wrapScript(module.source), {
      filename: module.filename,
      displayErrors: true,
    } as any).runInContext(this.vmContext) as WrappedScript;

    const scriptModule = new NodeModule(module.filename);
    scriptModule.require = createRequire(module.filename);

    script(
      scriptModule.exports,
      scriptModule.require,
      scriptModule,
      module.filename,
      path.dirname(module.filename)
    );

    const exports = scriptModule.exports;

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
}
