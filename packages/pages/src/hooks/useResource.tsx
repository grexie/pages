import { useMemo } from 'react';
import { createContextWithProps } from '@grexie/context';
import type {
  ContentResource,
  Resource,
  ResourceMetadata,
  ModuleResource,
} from '../api/Resource.js';
import { ResourceContext, ResourceContextSet } from '../api/Resource.js';
import { useDocument } from './useDocument.js';
import { hash } from '@grexie/hash-object';

export interface ResourceContextProviderProps {
  resourceContext: ResourceContext;
}

export const {
  Provider: ResourceContextProvider,
  with: withResourceContext,
  use: useResourceContext,
} = createContextWithProps<ResourceContext, ResourceContextProviderProps>(
  Provider =>
    ({ resourceContext, children }) => {
      return <Provider value={resourceContext}>{children}</Provider>;
    }
);

export const useRootResourceContext = () => {
  const resourceContext = useResourceContext();
  return resourceContext.root;
};

export interface ResourceProviderProps {
  resource: Resource;
}

const {
  Provider: ResourceProvider,
  with: withResource,
  use: useResourceUntyped,
} = createContextWithProps<Resource, ResourceProviderProps>(
  Provider =>
    ({ resource, children }) => {
      const parentResourceContext = useResourceContext();

      const resourceContext = useMemo(() => {
        let resourceContext = parentResourceContext;
        if (resourceContext.resource) {
          resourceContext = new ResourceContext(resourceContext);
        }
        resourceContext[ResourceContextSet](resource);
        return resourceContext;
      }, [parentResourceContext, hash(resource)]);

      return (
        <ResourceContextProvider resourceContext={resourceContext}>
          <Provider value={resource}>{children}</Provider>
        </ResourceContextProvider>
      );
    }
);

export interface ResourceQueryOptions {
  resource?: boolean;
}

export const useResource = <
  M extends ResourceMetadata = any,
  T extends Resource<M> = Resource<M>
>({ resource = false }: ResourceQueryOptions = {}) => {
  const parentResource = useResourceUntyped() as T;

  const document = useDocument();

  if (resource) {
    return parentResource;
  } else {
    return document.resource as T;
  }
};

export const useMetadata = <M extends ResourceMetadata = any>(
  options?: ResourceQueryOptions
) => useResource<M>(options).metadata;
export const useContent = <C = any,>(options?: ResourceQueryOptions) =>
  useResource<any, ContentResource<C>>(options).content;
export const useModule = <X = any,>(options?: ResourceQueryOptions) =>
  useResource<any, ModuleResource<X>>(options).exports;
export const usePath = (options?: ResourceQueryOptions) =>
  useResource(options).path;

export { ResourceProvider, withResource };
