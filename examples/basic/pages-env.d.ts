/// <reference types="@grexie/pages-plugin-sass" />

declare module '*.yml';
declare module '*.yaml';

declare module '*.tsx' {
  import { Resource } from '@grexie/pages';
  const resource: Resource;
}
