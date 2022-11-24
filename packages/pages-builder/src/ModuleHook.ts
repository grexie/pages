import { SourceContext } from './SourceContext.js';
import { Resource } from '@grexie/pages';

export interface ServerModuleHook {
  readonly resource: Resource;
  render: (specifier: string, exportName?: string) => Promise<void>;
  document: (specifier: string, exportName?: string) => Promise<void>;
}

export interface BrowserModuleHook {
  readonly context: SourceContext;
  render: (specifier: string, exportName?: string) => Promise<void>;
  document: (specifier: string, exportName?: string) => Promise<void>;
  layout: (specifier: string, exportName?: string) => Promise<void>;
}