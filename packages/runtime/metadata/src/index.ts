import { useMetadata, useProps, useRouter } from '@grexie/pages';
import { Metadata, MetadataContext } from './Metadata.js';
import * as React from 'react';

const ReactSharedInternals = (React as any)[
  '__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED'
];

export const wrapMetadata = (metadata: (() => any) | any) => {
  return (
    context: Omit<
      MetadataContext,
      '$resource' | '$document' | '$props' | '$router'
    >,
    parent?: Metadata
  ) => {
    let _metadata = metadata;
    if (typeof _metadata === 'function') {
      _metadata = _metadata(context);
    }

    const $resource = new Metadata(_metadata, parent);
    Metadata.setContext($resource, {
      get resource() {
        return $resource;
      },
      get document() {
        if (ReactSharedInternals.ReactCurrentDispatcher.current) {
          return useMetadata();
        } else {
          return $resource;
        }
      },
      get props() {
        if (ReactSharedInternals.ReactCurrentDispatcher.current) {
          return useProps();
        } else {
          return {};
        }
      },
      get router() {
        if (ReactSharedInternals.ReactCurrentDispatcher.current) {
          return useRouter();
        } else {
          return {};
        }
      },
      ...context,
    });
    return $resource;
  };
};
