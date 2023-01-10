import type { Provider } from './Provider.js';
import { BuildContext } from './BuildContext.js';
import _path from 'path';
import { Source } from './Source.js';
import path from 'path';

export interface GetOptions {
  path?: string[];
  slug?: string;
}

export interface ListOptions {
  path?: string[][] | string[];
  slug?: string[] | string;
}

export interface ProviderOptions {
  context: BuildContext;
  rootDir?: string;
  parentRootDir?: string;
  basePath?: string[];
  exclude?: string[];
  extensions?: string[];
  configExtensions?: string[];
  priority?: number;
}

export type ProviderConstructor<O extends ProviderOptions> = new (
  options: O
) => Provider;

export type ProviderConfig<
  P extends ProviderConstructor<O> = ProviderConstructor<ProviderOptions>,
  O extends ProviderOptions = ProviderOptions
> = {
  provider: P;
} & Omit<O, 'context'>;

class List<T> {
  #list: T[] = [];

  add(value: T, index: number = -1) {
    if (index === -1) {
      this.#list.push(value);
    } else {
      this.#list.splice(index, 0, value);
    }
  }

  remove(value: T) {
    const index = this.#list.indexOf(value);
    if (index === -1) {
      throw new Error('item not in list');
    }
    this.#list.splice(index, 1);
  }

  [Symbol.iterator] = this.#list[Symbol.iterator].bind(this.#list);
  map = this.#list.map.bind(this.#list);
  slice = this.#list.slice.bind(this.#list);
  find = this.#list.find.bind(this.#list);
  filter = this.#list.filter.bind(this.#list);
}

export class Registry {
  readonly context: BuildContext;
  readonly providers: List<Provider> = new List<Provider>();
  readonly defaultConfig: Source;

  constructor(context: BuildContext) {
    this.context = context;
    this.defaultConfig = new Source({
      context,
      filename: '@grexie/pages/defaults.pages',
      path: ['.pages'],
      priority: -Infinity,
      isPagesConfig: true,
    });
  }

  async merge(
    ...list: (Promise<Source[]> | Promise<Source> | Source[] | Source)[]
  ): Promise<Source[]> {
    const resolved: Source[] = [];
    for (let item of list) {
      item = await item;
      if (!Array.isArray(item)) {
        item = [item];
      }

      for (const source of item) {
        resolved.push(source);
      }
    }
    resolved.sort((a, b) => a.priority - b.priority);
    return resolved;
  }

  async list({ path, slug }: ListOptions = {}): Promise<Source[]> {
    const list = await this.merge(
      ...this.providers.map(async provider => provider.list({ path, slug }))
    );

    return list.filter(source => {
      return (
        this.context.root.sources.lookupMappingFrom(source.abspath) ===
        this.context.sources
      );
    });
  }

  async listConfig({ path, slug }: ListOptions = {}): Promise<Source[]> {
    const sources = await this.merge(
      this.defaultConfig,
      ...this.providers.map(async provider =>
        provider.listConfig({ path, slug })
      )
    );
    return sources;
  }

  async get(options: GetOptions): Promise<Source | undefined> {
    const resources = await this.list(options);
    return resources[0];
  }
}
