import {
  makeExecutableSchema,
  GraphQLSchema,
  graphqlSync,
  GraphQLObjectType,
  GraphQLInputObjectType,
  GraphQLInputFieldConfigMap,
  GraphQLInputType,
  GraphQLOutputType,
  GraphQLScalarType,
  GraphQLBoolean,
  isScalarType,
  isObjectType,
  isListType,
  GraphQLList,
  isNonNullType,
  GraphQLNonNull,
  isEnumType,
  GraphQLEnumType,
  isSchema,
  Kind,
  isIntrospectionType,
  parse as parseGraphQL,
  ASTNode,
  OperationDefinitionNode,
  DocumentNode,
  FieldNode,
  GraphQLType,
  valueFromAST,
  isInputObjectType,
  IResolvers,
  TypeSource,
  GraphQLString,
  GraphQLInt,
  ListValueNode,
} from './graphql.js';
import { Metadata, Resource, useMetadata } from '../hooks/useResource.js';
import { convertSchemas, newContext } from '../utils/schema.js';
import { Query } from './Query.js';
import { QueryCollector } from '../hooks/usePagesQuery.js';
import { hash } from '@grexie/hash-object';

export interface PagesOptions {
  readonly resources?: Record<string, Resource>;
}

export interface PagesContextOptions {
  queryCollector?: QueryCollector;
  data?: any;
  resources?: Resource[];
  typeDefs?: TypeSource;
  resolvers?: IResolvers<any, any>[];
  metadata?: Metadata | null;
  resourceMetadata?: Metadata | null;
  variables?: Record<string, any>;
  filename?: string;
}

export class Pages {
  #schema?: GraphQLSchema;

  createSchema(context: ReturnType<typeof this.createContext>) {
    const schemaContext = newContext();

    const importTypeDef = (typeDef: TypeSource) => {
      if (!isSchema(typeDef)) {
        typeDef = makeExecutableSchema({
          typeDefs: [typeDef],
        });
      }

      const schema = typeDef as GraphQLSchema;
      for (const [k, v] of Object.entries(schema.getTypeMap())) {
        if (
          !isIntrospectionType(v) &&
          !['Boolean', 'String', 'Int', 'Float'].includes(k) &&
          isScalarType(v)
        ) {
          schemaContext.inputs.set(v.name, v);
          schemaContext.types.set(v.name, v);
        }
      }

      return typeDef;
    };

    const jsonSchema = [
      context.metadata?.$schema,
      context.resourceMetadata?.$schema,
    ].filter(x => !!x);

    let typeDefs: TypeSource[] = [
      `
          type Query
      `,
      ...(context.typeDefs as any[]),
    ];

    typeDefs = [importTypeDef(typeDefs)];

    convertSchemas(schemaContext, jsonSchema);

    const schema = new GraphQLSchema({
      types: [...schemaContext.types.values()],
    });

    typeDefs.push(schema);

    const resolvers: IResolvers<
      any,
      { resources: Resource[]; metadata: Metadata; resourceMetadata: Metadata }
    >[] = [...context.resolvers];

    typeDefs.push(`
        extend type Query {
          page(slug: String): Metadata
        }
      `);

    resolvers.push({
      Query: {
        page: (_: any, { slug }, context) => {
          if (slug) {
            return context.resources.find(resource => resource.slug === slug)
              ?.metadata;
          }

          return context.metadata;
        },
      },
    });

    typeDefs.push(`
        extend type Query {
          resource: Metadata!
        }
      `);
    resolvers.push({
      Query: {
        resource: (_: any, {}, context: any) => context.resourceMetadata,
      },
    });

    const createScalarFilterInput = (
      name: string,
      type:
        | GraphQLScalarType
        | GraphQLEnumType
        | GraphQLNonNull<GraphQLScalarType>
    ): GraphQLInputObjectType => {
      return new GraphQLInputObjectType({
        name: name + 'FilterInput',
        fields: {
          in: {
            type: new GraphQLList(type),
          },
          nin: {
            type: new GraphQLList(type),
          },
          eq: {
            type,
          },
          ne: {
            type,
          },
          gt: {
            type,
          },
          gte: {
            type,
          },
          lt: {
            type,
          },
          lte: {
            type,
          },
        },
      });
    };

    const convertTypeToFilterInput = (
      type: GraphQLOutputType
    ): GraphQLInputType => {
      if (isScalarType(type)) {
        return pagesInputs.find(
          t => (t as GraphQLInputObjectType).name === type.name + 'FilterInput'
        )!;
      } else if (isEnumType(type)) {
        return createScalarFilterInput(type.name, type);
      } else if (isObjectType(type)) {
        const objectType = type as GraphQLObjectType;
        let inputType = pagesInputs.find(
          x => (x as any).name === type.name + 'FilterInput'
        );
        if (inputType) {
          return inputType;
        }
        inputType = new GraphQLInputObjectType({
          name: `${objectType.name}FilterInput`,
          fields: Object.entries(objectType.getFields()).reduce(
            (a, [name, field]) => ({
              ...a,
              [name]: {
                type: convertTypeToFilterInput(field.type),
              },
            }),
            {} as GraphQLInputFieldConfigMap
          ),
        });
        pagesInputs.push(inputType);
        return inputType;
      } else if (isListType(type)) {
        const listType = type as GraphQLList<any>;
        return convertTypeToFilterInput(listType.ofType);
      } else if (isNonNullType(type)) {
        const nonNullType = type as GraphQLNonNull<any>;
        return convertTypeToFilterInput(nonNullType.ofType);
      } else {
        throw new TypeError('unknown graphql type');
      }
    };

    const convertTypeToGroupInput = (
      type: GraphQLOutputType
    ): GraphQLInputType => {
      if (isScalarType(type) || isEnumType(type)) {
        return GraphQLBoolean;
      } else if (isObjectType(type)) {
        const objectType = type as GraphQLObjectType;
        let inputType = pagesInputs.find(
          x => (x as any).name === type.name + 'GroupInput'
        );
        if (inputType) {
          return inputType;
        }
        inputType = new GraphQLInputObjectType({
          name: `${objectType.name}GroupInput`,
          fields: Object.entries(objectType.getFields()).reduce(
            (a, [name, field]) => ({
              ...a,
              [name]: {
                type: convertTypeToGroupInput(field.type),
              },
            }),
            {} as GraphQLInputFieldConfigMap
          ),
        });
        pagesInputs.push(inputType);
        return inputType;
      } else if (isListType(type)) {
        const listType = type as GraphQLList<any>;
        return convertTypeToGroupInput(listType.ofType);
      } else if (isNonNullType(type)) {
        const nonNullType = type as GraphQLNonNull<any>;
        return convertTypeToGroupInput(nonNullType.ofType);
      } else {
        throw new TypeError('unknown graphql type');
      }
    };

    const pagesInputs: GraphQLInputType[] = [];

    typeDefs = [
      makeExecutableSchema({
        typeDefs,
      }),
    ];

    for (const type of Object.values(
      (typeDefs[0] as GraphQLSchema).getTypeMap()
    )) {
      if (
        !isIntrospectionType(type) &&
        isScalarType(type) &&
        type.name !== 'Query'
      ) {
        pagesInputs.push(createScalarFilterInput(type.name, type));
        pagesInputs.push(
          createScalarFilterInput(
            `NonNull${type.name}`,
            new GraphQLNonNull(type)
          )
        );
      }
    }

    for (const type of schemaContext.types.values()) {
      convertTypeToFilterInput(type) as any;
      convertTypeToGroupInput(type) as any;
    }

    typeDefs.push(
      new GraphQLSchema({
        types: pagesInputs as any,
      }),
      `
        type PagesResult {
          resources: [Metadata!]!
          count: Int!
        }

        extend type Query {
          pages(filter: MetadataFilterInput, group: MetadataGroupInput, sort: [String!], offset: Int, limit: Int): PagesResult!
        }
      `
    );

    resolvers.push({
      Query: {
        pages: (_, inputs, context, info) => {
          const query = new Query(inputs);
          const { resources, count } = query.execute(context.resources);

          return {
            resources: resources.map(resource => resource.metadata),
            count,
          };
        },
      },
    });

    return makeExecutableSchema({
      typeDefs,
      resolvers,
    });
  }

  createContext({
    queryCollector,
    data,
    resources,
    typeDefs,
    resolvers,
    metadata = useMetadata(),
    resourceMetadata = useMetadata({ resource: true }),
    variables = {},
    filename,
  }: PagesContextOptions = {}) {
    if (typeof metadata === 'undefined') {
      metadata = useMetadata();
    }
    if (typeof resourceMetadata === 'undefined') {
      resourceMetadata = useMetadata({ resource: true });
    }

    return {
      queryCollector,
      data,
      resources,
      typeDefs: typeDefs ?? [],
      resolvers: resolvers ?? [],
      metadata,
      resourceMetadata,
      variables,
      filename,
    };
  }

  hydrateScalars(type: GraphQLType, ast: ASTNode, data: any): any {
    if (ast.kind === Kind.DOCUMENT) {
      const document = ast as DocumentNode;

      const operation = document.definitions[0];
      return this.hydrateScalars(type, operation, data);
    } else if ([Kind.OPERATION_DEFINITION, Kind.FIELD].includes(ast.kind)) {
      const operation = ast as OperationDefinitionNode | FieldNode;

      if (isNonNullType(type)) {
        return this.hydrateScalars(
          (type as GraphQLNonNull<any>).ofType,
          ast,
          data
        );
      } else if (isListType(type)) {
        const listType = (type as GraphQLList<any>).ofType;

        return data?.map((item: any, i: number) =>
          this.hydrateScalars(listType, ast, item)
        );
      } else if (isObjectType(type)) {
        if (data) {
          for (const selection of operation.selectionSet?.selections ?? []) {
            const field = selection as FieldNode;
            data[field.alias?.value ?? field.name.value] = this.hydrateScalars(
              (type as GraphQLObjectType).getFields()[field.name.value].type,
              selection,
              data?.[field.alias?.value ?? field.name.value]
            );
          }
        }
        return data;
      } else if (isScalarType(type)) {
        let kind:
          | Kind.INT
          | Kind.FLOAT
          | Kind.NULL
          | Kind.OBJECT
          | Kind.LIST
          | Kind.BOOLEAN
          | Kind.STRING
          | Kind.ENUM;

        if (data === null) {
          kind = Kind.NULL;
        } else if (Array.isArray(data)) {
          kind = Kind.LIST;
        } else if (typeof data === 'object') {
          kind = Kind.OBJECT;
        } else if (typeof data === 'boolean') {
          kind = Kind.BOOLEAN;
        } else if (parseInt(data) === data) {
          kind = Kind.INT;
        } else if (typeof data === 'number') {
          kind = Kind.FLOAT;
        } else if (typeof data === 'string') {
          kind = Kind.STRING;
        } else if (isEnumType(type)) {
          kind = Kind.ENUM;
        } else {
          throw new Error('invalid literal type: ' + type.name + ' ' + data);
        }

        data = valueFromAST({ kind: kind as any, value: data }, type);

        return data;
      } else {
        return data;
      }
    } else {
      return data;
    }
  }

  query<T = any>(
    query: string,
    context: ReturnType<typeof this.createContext>
  ) {
    const schema = this.createSchema(context);
    const contextData = context.data ?? context.queryCollector?.data;
    const queryHash = hash({
      query,
      variables: context.variables,
    });

    if (contextData[queryHash]) {
      return this.hydrateScalars(
        schema.getQueryType()!,
        parseGraphQL(query),
        contextData[queryHash]
      ) as T;
    }

    if (!context.resources) {
      throw new Error('must run query through metadata loader');
    }

    const { data, errors } = graphqlSync({
      schema,
      source: query,
      contextValue: context,
      variableValues: context.variables,
    });

    if (errors?.length) {
      throw errors[0];
    }

    context.queryCollector?.add(queryHash, data, context.filename);

    return this.hydrateScalars(
      schema.getQueryType()!,
      parseGraphQL(query),
      data
    ) as T;
  }
}
