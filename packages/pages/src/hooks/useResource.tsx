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
import type { Context } from '../api/Context.js';
import { useContext } from './useContext.js';

export interface ResourceContextProviderProps {
  resourceContext: ResourceContext;
}

export const {
  Provider: ResourceContextProvider,
  with: withResourceContext,
  use: useResourceContext,
} = createContextWithProps<ResourceContext, ResourceContextProviderProps>(
  'Pages.ResourceContext',
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
  resource: (context: Context) => Resource;
}

const {
  Provider: ResourceProvider,
  with: withResource,
  use: useResourceUntyped,
} = createContextWithProps<Resource, ResourceProviderProps>(
  'Pages.Resource',
  Provider =>
    ({ resource: resourceFactory, children }) => {
      const context = useContext();
      const parentResourceContext = useResourceContext();

      const resourceContext = useMemo(() => {
        let resourceContext = parentResourceContext;
        if (resourceContext.resource) {
          resourceContext = new ResourceContext(resourceContext);
        }
        const resource = resourceContext.root.createResource(
          resourceFactory,
          context
        );
        resourceContext[ResourceContextSet](resource);
        return resourceContext;
      }, [parentResourceContext, resourceFactory]);

      return (
        <ResourceContextProvider resourceContext={resourceContext}>
          <Provider value={resourceContext.resource}>{children}</Provider>
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

export const useConfig = <M extends ResourceMetadata = any>(
  options?: ResourceQueryOptions
) => useResource<M>(options).config;
export const useContent = <C = any,>(options?: ResourceQueryOptions) =>
  useResource<any, ContentResource<C>>(options).content;
export const useModule = <X = any,>(options?: ResourceQueryOptions) =>
  useResource<any, ModuleResource<X>>(options).exports;
export const usePath = (options?: ResourceQueryOptions) =>
  useResource(options).path;

export { ResourceProvider, withResource };
