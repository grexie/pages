import type { ComponentType } from 'react';
import { useMemo } from 'react';
import { usePath } from './useResource.js';
import _path from 'path';
import { hash } from '@grexie/hash-object';

export type SourceTree = { [key: string]: SourceTree | string };

export type ComponentTree = { [key: string]: ComponentTree | ComponentType };

export const useComponents = (resources: SourceTree): ComponentTree => {
  const thisSlug = ['', usePath()].join('/');

  return useMemo(() => {
    const out: ComponentTree = {};
    const next = (
      resources: SourceTree,
      current: ComponentTree,
      path: string[] = []
    ) => {
      for (const k in resources) {
        if (Array.isArray(resources[k])) {
          const slug = ['', ...path, k].join('/');
          current[k] = require(_path.relative(
            _path.join(thisSlug, 'index.js'),
            _path.join(slug, 'index.js')
          ));
        } else {
          current[k] = current[k] || {};
          next(resources[k] as SourceTree, current[k] as ComponentTree, [
            ...path,
            k,
          ]);
        }
      }
    };
    next(resources, out);
    return out;
  }, [hash(resources)]);
};
