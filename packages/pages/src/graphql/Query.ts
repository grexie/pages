import { Resource } from '../hooks/useResource.js';
import lodash from 'lodash';

export interface QueryOptions {
  readonly filter?: any;
  readonly group?: any;
  readonly sort?: string[];
  readonly offset?: number;
  readonly limit?: number;
}

export class Query {
  readonly filter?: any;
  readonly group?: any;
  readonly sort?: string[];
  readonly offset?: number;
  readonly limit?: number;

  constructor({ filter, group, sort, offset, limit }: QueryOptions) {
    this.filter = filter ?? {};
    this.group = group;
    this.sort = sort;
    this.offset = offset;
    this.limit = limit;
  }

  execute(resources: Resource[]) {
    for (const key in this.filter ?? {}) {
      resources = resources.filter(resource =>
        this.#filter(this.filter[key], key, resource.metadata)
      );
    }
    for (const key in this.group ?? {}) {
    }

    if (this.sort) {
      resources = resources.slice().sort(({ metadata: a }, { metadata: b }) => {
        for (let key of this.sort ?? []) {
          let order = 1;

          if (key.startsWith('-')) {
            key = key.substring(1);
            order *= -1;
          }

          const ak = lodash.get(a, key);
          const bk = lodash.get(b, key);

          if (ak > bk) {
            return 1 * order;
          }

          if (ak < bk) {
            return -1 * order;
          }
        }

        return 0;
      });
    }

    const count = resources.length;

    resources = resources.slice(this.offset ?? 0);
    resources = resources.slice(0, this.limit ?? resources.length);

    return { resources, count };
  }

  #filter(filter: any, key: string, object: any) {
    if (
      typeof object === 'object' &&
      object !== null &&
      typeof object[key] === 'object' &&
      !Array.isArray(object[key])
    ) {
      // console.info(filter, key, object);
    } else if (
      typeof object === 'object' &&
      object !== null &&
      Array.isArray(object[key])
    ) {
      return object[key].reduce(
        (a: boolean, b: any) => a || this.#filter(filter, key, { [key]: b }),
        false
      );
    }

    let filtered = true;

    if (filter.in) {
      filtered &&= filter.in.includes(object[key]);
    }
    if (filter.nin) {
      filtered &&= !filter.nin.includes(object[key]);
    }
    if (filter.eq) {
      filtered &&= filter.eq == object[key];
    }
    if (filter.ne) {
      filtered &&= filter.ne != object[key];
    }
    if (filter.gt) {
      filtered &&= object[key] > filter.gt;
    }
    if (filter.gte) {
      filtered &&= object[key] >= filter.gte;
    }
    if (filter.lt) {
      filtered &&= object[key] < filter.lt;
    }
    if (filter.lte) {
      filtered &&= object[key] <= filter.lte;
    }

    return filtered;
  }

  #group(group: any, key: string, object: any) {}
}
