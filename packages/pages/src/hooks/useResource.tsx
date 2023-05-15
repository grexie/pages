import { useMemo, ComponentType } from 'react';
import { createContextWithProps } from '@grexie/context';
import { useDocument } from './useDocument.js';
import { compose } from '@grexie/compose';

export interface Metadata {
  [k: symbol | string | number]: any;
}

export interface Resource<M extends any = Metadata> {
  path: string[];
  slug: string;
  metadata: M;
}

export class ResourceContext {
  readonly parent?: ResourceContext;
  readonly #children: ResourceContext[] = [];
  #resource: Resource;

  constructor(resource: Resource, parent?: ResourceContext) {
    this.parent = parent;
    this.#resource = resource;

    if (parent) {
      parent.#children.push(this);
    }
  }

  get root() {
    let self: ResourceContext = this;
    while (self.parent) {
      self = self.parent;
    }
    return self;
  }

  get children() {
    return this.#children.slice();
  }

  get resource() {
    return this.#resource;
  }

  get resources() {
    const stack: ResourceContext[] = [this];
    let el: ResourceContext | undefined;
    const out: Resource[] = [];
    while ((el = stack.shift())) {
      if (el.resource) {
        out.push(el.resource);
      }
      stack.push(...el.#children);
    }
    return out;
  }
}

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
  resource: Resource;
}

const {
  Provider: ResourceProvider,
  with: withResource,
  use: useResourceUntyped,
} = createContextWithProps<Resource, ResourceProviderProps>(
  'Pages.Resource',
  Provider =>
    ({ resource, children }) => {
      const parentResourceContext = useResourceContext();

      const resourceContext = useMemo(() => {
        return new ResourceContext(resource, parentResourceContext);
      }, [parentResourceContext, resource]);

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
  M extends Metadata = any,
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

export const useMetadata = <M extends Metadata = any>(
  options?: ResourceQueryOptions
) => useResource<M>(options).metadata;
export const usePath = (options?: ResourceQueryOptions) =>
  useResource(options).path;

export { ResourceProvider, withResource };

export const wrapResource = (Component: ComponentType, resource: Resource) =>
  compose(withResource({ resource }), Component);
