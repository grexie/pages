declare module '@grexie/pages-resources-plugin';
declare module 'webpack/lib/dependencies/EntryDependency.js';

declare module 'vm' {
  export * from 'node:vm';
  export enum ModuleStatus {
    unlinked = 'unlinked',
    linking = 'linking',
    linked = 'linked',
    evaluating = 'evaluating',
    evaluated = 'evaluated',
    errored = 'errored',
  }
  export interface ModuleEvaluateOptions {}
  export type ModuleLinker = (request: string) => Promise<Module> | Module;
  export abstract class Module {
    readonly dependencySpecifiers: string[];
    readonly error: any;
    readonly identifier: string;
    readonly namespace: object;

    get status(): ModuleStatus;
    evaluate(options: ModuleEvaluateOptions): Promise<void>;
    link(linker: ModuleLinker): Promise<Module>;
  }

  export interface SourceTextModuleOptions {
    identifier?: string;
    cachedData?: Buffer | ArrayBufferTypes | DataView;
    context: object;
    lineOffset?: number;
    columnOffset?: number;
    initializeImportMeta: (meta: ImportMeta, module: SourceTextModule) => void;
    importModuleDynamically: (
      specified: string,
      module: Module,
      importAssertions: object
    ) => object | Module;
  }

  export class SourceTextModule extends Module {
    constructor(code: string, options: SourceTextModuleOptions);
    createCachedData(): Buffer;
  }

  export const SyntheticModule: any;
}
