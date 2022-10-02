import type { Provider } from './Provider';
import { BuildContext } from '../builder/BuildContext';
import _path from 'path';
import { Source, SourceTree } from './Source';
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
  exclude?: string[];
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
      filename: path.resolve(context.pagesDir, 'defaults.pages.js'),
      path: [],
    });
  }

  async list({ path, slug }: ListOptions = {}): Promise<Source[]> {
    return Array.from(
      new Set(
        (
          await Promise.all(
            this.providers.map(async provider => provider.list({ path, slug }))
          )
        ).reduce((a, b) => [...a, ...b], [])
      )
    );
  }

  async listConfig({ path, slug }: ListOptions = {}): Promise<Source[]> {
    return [
      this.defaultConfig,
      ...Array.from(
        new Set(
          (
            await Promise.all(
              this.providers.map(async provider =>
                provider.listConfig({ path, slug })
              )
            )
          ).reduce((a, b) => [...a, ...b], [])
        )
      ),
    ];
  }

  async get(options: GetOptions): Promise<Source | undefined> {
    const resources = await this.list(options);
    return resources[0];
  }

  async tree(options: ListOptions): Promise<SourceTree> {
    const resources = await this.list(options);
    const tree: SourceTree = {};
    for (const resource of resources) {
      let current = tree;
      let path = resource.path.slice();
      let cont = false;
      while (path.length > 1) {
        let name = path.shift()!;
        name = name[0].toUpperCase() + name.substring(1);

        if (Array.isArray(current[name])) {
          cont = true;
          break;
        }
        current[name] = current[name] || {};
        current = current[name] as SourceTree;
      }
      if (cont) {
        continue;
      }
      let name = path.shift()!;
      name = name[0].toUpperCase() + name.substring(1);
      current[name] = _path.relative(resource.filename, this.context.rootDir);
    }
    return tree;
  }
}
