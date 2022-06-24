import React from 'react';
import { createContextWithProps } from '../utils/context';
import { ContentResource, ModuleResource, Resource } from '../api';
import { useDocument } from './useDocument';

export interface ResourceQueryOptions {
  resource?: boolean;
}

export interface ResourceProviderProps {
  resource: Resource;
}

const {
  Provider: ResourceProvider,
  with: withResource,
  use: useResourceUntyped,
} = createContextWithProps<Resource, ResourceProviderProps>(
  Provider =>
    ({ resource, children }) =>
      <Provider value={resource}>{children}</Provider>
);

export const useResource = <M = any, T extends Resource<M> = Resource<M>>({
  resource = false,
}: ResourceQueryOptions = {}) => {
  const parentResource = useResourceUntyped() as T;
  const document = useDocument();

  if (resource) {
    return parentResource;
  } else {
    return document.resource as T;
  }
};

export const useMetadata = <M = any,>(options?: ResourceQueryOptions) =>
  useResource<M>(options).metadata;
export const useContent = <C = any,>(options?: ResourceQueryOptions) =>
  useResource<any, ContentResource<C>>(options).content;
export const useModule = <X = any,>(options?: ResourceQueryOptions) =>
  useResource<any, ModuleResource<X>>(options).exports;
export const usePath = (options?: ResourceQueryOptions) =>
  useResource(options).path;

export { ResourceProvider, withResource };
