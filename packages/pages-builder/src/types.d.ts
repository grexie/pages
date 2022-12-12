declare module '@grexie/pages-resources-plugin';
declare module 'webpack/lib/dependencies/EntryDependency.js';

declare module '*.scss' {
  import type { StyleFunction } from '@grexie/pages-plugin-sass';
  const styles: StyleFunction;
  export default styles;
}

declare module '*.css' {
  import type { StyleFunction } from '@grexie/pages-plugin-css';
  const styles: StyleFunction;
  export default styles;
}

declare module '*.svg' {
  import type { Image } from '@grexie/pages-plugin-image';
  const Component: Image;
  export default Component;
}

declare namespace NodeJS {
  namespace LoaderHooks {
    enum ModuleFormat {
      builtin = 'builtin',
      commonjs = 'commonjs',
      json = 'json',
      module = 'module',
      wasm = 'wasm',
    }

    export type Resolve = (
      specifier: string,
      context: {
        conditions: string[];
        importAssertions: any;
        parentURL?: string;
      },
      nextResolve: (
        specifier: string,
        context: object
      ) => { format?: ModuleFormat | null; shortCircuit?: boolean; url: string }
    ) => Promise<{
      format?: ModuleFormat | null;
      shortCircuit?: boolean;
      url: string;
    }>;

    export type Load = (
      url: string,
      context: {
        conditions: string[];
        importAssertions: any;
        format?: ModuleFormat | null;
      },
      nextLoad: (
        url: string,
        context: object
      ) => {
        format?: ModuleFormat | null;
        shortCircuit?: boolean;
        source: string;
      }
    ) => Promise<{
      format?: ModuleFormat | null;
      shortCircuit?: boolean;
      source: string;
    }>;
  }
}

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
