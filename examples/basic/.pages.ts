import {
  GraphQLScalarType,
  TypeSource,
  IResolvers,
} from '@grexie/pages/graphql';
import { Resource } from '@grexie/pages';
import categories from './pages/.categories.yml';

export const typeDefs: TypeSource = [
  `
    scalar Date
    scalar Category

    extend type Query {
      categories: [String!]!
    }

    type Metadata

    extend type Metadata {
      previous: Metadata
      next: Metadata
    }
  `,
];

export const resolvers: IResolvers<any, any>[] = [
  {
    Date: new GraphQLScalarType({
      name: 'Date',
      parseLiteral(valueNode) {
        return new Date((valueNode as any).value);
      },
      parseValue(inputValue) {
        return new Date(inputValue as any);
      },
      serialize(outputValue) {
        return new Date(outputValue as any).toISOString();
      },
    }),
    Metadata: {
      previous: (metadata, {}, context, info) => {
        const resources = context.resources.slice();
        const index = resources.findIndex(
          (m: any) => m.metadata.slug === metadata.slug
        );
        return resources[index - 1]?.metadata;
      },
      next: (metadata, {}, context, info) => {
        const resources = context.resources.slice();

        const index = resources.findIndex(
          (m: any) => m.metadata.slug === metadata.slug
        );
        return resources[index + 1]?.metadata;
      },
    },
    Category: new GraphQLScalarType({
      name: 'Category',
      parseLiteral(valueNode) {
        return new Category((valueNode as any).value).id;
      },
      parseValue(inputValue) {
        return new Category(inputValue as any).id;
      },
      serialize(outputValue) {
        return new Category(outputValue as any).id;
      },
    }),
    Query: {
      categories: (_, params, { resources }, info) => {
        return new Set(
          resources?.reduce(
            (a: string[], b: Resource) => [
              ...a,
              ...(b.metadata?.categories ?? []),
            ],
            [] as string[]
          ) ?? []
        );
      },
    },
  },
];

export class Category {
  readonly id: string;
  readonly slug: string;
  readonly name: string;

  constructor(id: string | Category) {
    const category = id instanceof Category ? id : categories[id];
    if (!category) {
      throw new Error('cannot find category with id ' + id);
    }
    this.id = id instanceof Category ? category.id : id;
    this.slug = category.slug;
    this.name = category.name;
  }

  get path() {
    return this.slug.split(/\//g).slice(1);
  }

  static fromPath(path: string[]) {
    const slug = ['', ...path].join('/');
    return Category.fromSlug(slug);
  }

  static fromSlug(slug: string) {
    const id = Object.keys(categories).find(id => categories[id].slug === slug);
    if (!id) {
      throw new ReferenceError(
        'category with slug ' + slug + ' does not exist'
      );
    }
    return new Category(id);
  }

  static all() {
    return Object.keys(categories).map(id => new Category(id));
  }

  toJSON() {
    return this.id;
  }
}

export default {
  type: 'import',
  $schema: {
    id: 'Metadata',
    type: 'object',
    properties: {
      path: {
        type: 'array',
        items: {
          type: 'string',
        },
      },
      slug: {
        type: 'string',
      },
      type: {
        type: 'string',
        enum: ['page', 'post', 'category', 'import'],
      },
      title: {
        type: ['string', 'null'],
      },
      date: {
        $ref: 'Date',
        type: ['string', 'null'],
      },
      categories: {
        type: ['array', 'null'],
        items: {
          type: 'string',
          $ref: 'Category',
        },
      },
      excerpt: {
        type: 'string',
      },
      head: {
        id: 'Head',
        type: ['object', 'null'],
        properties: {
          title: {
            type: 'string',
          },
          description: {
            type: 'string',
          },
          robots: {
            id: 'HeadRobots',
            type: ['object', 'null'],
            properties: {
              index: {
                type: ['boolean', 'null'],
              },
              follow: {
                type: ['boolean', 'null'],
              },
            },
          },
          viewport: {
            type: ['string', 'null'],
          },
          charset: {
            type: ['string', 'null'],
          },
          refresh: {
            id: 'HeadRefresh',
            type: ['object', 'null'],
            properties: {
              url: {
                type: 'string',
              },
              timeout: {
                type: 'number',
              },
            },
          },
          scripts: {
            type: ['array', 'null'],
            items: {
              type: 'string',
            },
          },
          styles: {
            type: ['array', 'null'],
            items: {
              type: 'string',
            },
          },
          preload: {
            type: ['array', 'null'],
            items: {
              id: 'HeadPreload',
              type: 'object',
              properties: {
                as: {
                  type: 'string',
                },
                href: {
                  type: 'string',
                },
              },
            },
          },
        },
      },
    },
  },
};
