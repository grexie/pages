import {
  GraphQLObjectType,
  GraphQLString,
  GraphQLInt,
  GraphQLNonNull,
  GraphQLUnionType,
  GraphQLInputObjectType,
  GraphQLFloat,
  GraphQLList,
  GraphQLBoolean,
  GraphQLEnumType,
} from '../graphql/graphql.js';
import isEmpty from 'lodash/isEmpty.js';
import keyBy from 'lodash/keyBy.js';
import mapValues from 'lodash/mapValues.js';
import map from 'lodash/map.js';
import omitBy from 'lodash/omitBy.js';
import includes from 'lodash/includes.js';
import uppercamelcase from 'uppercamelcase';
import camelcase from 'camelcase';
import escodegen from 'escodegen';
import * as validators from './schema-validators.js';

export const INPUT_SUFFIX = 'In';
const DEFINITION_PREFIX = 'Definition';
const DROP_ATTRIBUTE_MARKER = Symbol('A marker to drop the attributes');

const referencePrefix = '#/definitions/';

export function normalizeTypeName(typeName: string) {
  /* If the typeName is a URI, this will extract the
     file-name between the last '/' and '.json' extension
     If the typeName is not a URI, this will only camelCase it */
  const normalizedTypeName = uppercamelcase(
    typeName
      .slice(typeName.lastIndexOf('/') + 1, typeName.length)
      .replace(/(\.schema)?\.json/g, '')
  );
  validators.validateTypeName(typeName, normalizedTypeName);
  return normalizedTypeName;
}

export function getItemTypeName(typeName: string, buildingInputType?: boolean) {
  const normalizedTypeName = normalizeTypeName(typeName);
  return `${normalizedTypeName}${buildingInputType ? INPUT_SUFFIX : ''}`;
}

export function getReferenceName(
  referenceName: string,
  buildingInputType: boolean
) {
  return referenceName.startsWith(referencePrefix)
    ? getItemTypeName(
        `${DEFINITION_PREFIX}.${referenceName.split(referencePrefix)[1]}`,
        buildingInputType
      )
    : referenceName;
}

export function mapBasicAttributeType(type: string, attributeName: string) {
  switch (type) {
    case 'string':
      return GraphQLString;
    case 'integer':
      return GraphQLInt;
    case 'number':
      return GraphQLFloat;
    case 'boolean':
      return GraphQLBoolean;
    default:
      throw new Error(
        `A JSON Schema attribute type ${type} on attribute ${attributeName} does not have a known GraphQL mapping`
      );
  }
}

export function toSafeEnumKey(value: string) {
  if (/^[0-9]/.test(value)) {
    value = 'VALUE_' + value;
  }

  switch (value) {
    case '<':
      return 'LT';
    case '<=':
      return 'LTE';
    case '>=':
      return 'GTE';
    case '>':
      return 'GT';
    default:
      return value.replace(/[^_a-zA-Z0-9]/g, '_');
  }
}

export function buildEnumType(
  context: any,
  attributeName: string,
  enumValues: string[]
) {
  const enumName = uppercamelcase(attributeName);
  const graphqlToJsonMap = keyBy(enumValues, toSafeEnumKey);

  context.enumMaps.set(attributeName, graphqlToJsonMap);
  const enumType = new GraphQLEnumType({
    name: enumName,
    values: mapValues(graphqlToJsonMap, function (value) {
      return { value };
    }),
  });

  context.enumTypes.set(attributeName, enumType);
  return enumType;
}

// Handles any custom object types fields. It will map on all the properties of the object with
// mapType to match to the corresponding graphql type. It also handles the required/nonNull types
export function getObjectFields(
  context: any,
  schema: any,
  typeName: string,
  buildingInputType: string
): any {
  if (isEmpty(schema.properties)) {
    return {
      _typesWithoutFieldsAreNotAllowed_: {
        type: GraphQLString,
      },
    };
  }
  return omitBy(
    mapValues(schema.properties, function (attributeDefinition, attributeName) {
      const qualifiedAttributeName = `${typeName}.${attributeName}`;
      const type = mapType(
        context,
        attributeDefinition,
        qualifiedAttributeName,
        buildingInputType
      );

      const modifiedType = includes(schema.required, attributeName)
        ? new GraphQLNonNull(type)
        : type;
      return {
        type: modifiedType,
        description: attributeDefinition.description,
      };
    }),
    { type: DROP_ATTRIBUTE_MARKER }
  );
}

// Matches any json schema type to the graphql corresponding type (including recursive types)
export function mapType(
  context: any,
  attributeDefinition: any,
  attributeName: string,
  buildingInputType?: any
): any {
  let processedType: string;
  if (Array.isArray(attributeDefinition.type)) {
    if (attributeDefinition.type.length === 2) {
      if (
        attributeDefinition.type.includes('null') ||
        attributeDefinition.type.includes(null)
      ) {
        processedType = attributeDefinition.type.find(
          (element: any) => element !== 'null' && element !== null
        );
      } else {
        throw new Error(
          'JSON Schema type attribute arrays should only be used to specify nullable type "[null, string]"'
        );
      }
    } else {
      throw new Error(
        `JSON Schema attribute type array can only have a max of 2 types/elements`
      );
    }
  } else {
    processedType = attributeDefinition.type;
  }

  if (processedType === 'array') {
    const itemName = attributeDefinition.items.$ref
      ? attributeName
      : `${attributeName}Item`;
    const elementType = mapType(
      context,
      attributeDefinition.items,
      itemName,
      buildingInputType
    );
    if (elementType === DROP_ATTRIBUTE_MARKER) {
      return DROP_ATTRIBUTE_MARKER;
    }
    return new GraphQLList(new GraphQLNonNull(elementType));
  }

  if (processedType === 'object') {
    const name = getItemTypeName(attributeName, buildingInputType);
    // getFields need to be called lazily, since some types might not be available at the creation of
    // the object (with circular refs for instance)
    return buildingInputType
      ? new GraphQLInputObjectType({
          name,
          fields: () =>
            getObjectFields(
              context,
              attributeDefinition,
              attributeName,
              buildingInputType
            ),
          description: attributeDefinition.description,
        })
      : new GraphQLObjectType({
          name,
          fields: () =>
            getObjectFields(
              context,
              attributeDefinition,
              attributeName,
              buildingInputType
            ),
          description: attributeDefinition.description,
        });
    // return objectFromSchema(context, attributeDefinition, attributeName, buildingInputType);
  }

  const enumValues = attributeDefinition.enum;
  if (enumValues) {
    if (processedType !== 'string') {
      throw new Error(
        `The attribute ${attributeName} not supported because only conversion of string based enumertions are implemented`
      );
    }

    const existingEnum = context.enumTypes.get(attributeName);
    if (existingEnum) {
      return existingEnum;
    }

    return buildEnumType(context, attributeName, enumValues);
  }

  const typeReference = attributeDefinition.$ref;
  if (typeReference) {
    const typeReferenceName = getReferenceName(
      typeReference,
      buildingInputType
    );

    const typeMap = buildingInputType ? context.inputs : context.types;

    const referencedType = typeMap.get(typeReferenceName);

    if (!referencedType) {
      if (
        context.types.get(typeReferenceName) instanceof GraphQLUnionType &&
        buildingInputType
      ) {
        return DROP_ATTRIBUTE_MARKER;
      }
      const err: any = new UnknownTypeReference(
        `The referenced type ${typeReferenceName} (${
          buildingInputType || 'Not Input Type'
        }) is unknown in ${attributeName}`
      );
      if (typeReferenceName.startsWith('http'))
        err.subMessage =
          'Cannot reference schema from external URIs. Duplicate the schema in a local file';
      throw err;
    }
    return referencedType;
  }

  if (attributeDefinition.switch || attributeDefinition.oneOf) {
    return buildUnionType(
      context,
      attributeName,
      attributeDefinition,
      buildingInputType
    );
  }

  return mapBasicAttributeType(processedType, attributeName);
}

export function registerDefinitionTypes(
  context: any,
  schema: any,
  buildingInputType?: boolean
) {
  if (schema.definitions) {
    validators.validateDefinitions(schema.definitions);
    const typeMap = buildingInputType ? context.inputs : context.types;
    mapValues(schema.definitions, function (definition, definitionName) {
      const itemName = uppercamelcase(`${DEFINITION_PREFIX}.${definitionName}`);
      typeMap.set(
        getItemTypeName(itemName, buildingInputType),
        mapType(context, definition, itemName, buildingInputType)
      );
    });
  }
}

export function buildUnionType(
  context: any,
  typeName: string,
  schema: any,
  buildingInputType?: boolean
) {
  if (buildingInputType) return DROP_ATTRIBUTE_MARKER;
  let union: any;
  let getElement: any;
  if (schema.switch) {
    union = schema.switch;
    getElement = (switchCase: any) => switchCase.then;
  } else {
    union = schema.oneOf;
    getElement = (element: any) => element;
  }
  return new GraphQLUnionType({
    name: uppercamelcase(typeName),
    types: () => {
      return map(union, function (unionElement, caseIndex) {
        return mapType(
          context,
          getElement(unionElement),
          `${typeName}.switch${caseIndex}`
        );
      });
    },
  });
}

export function buildRootType(context: any, typeName: string, schema: any) {
  registerDefinitionTypes(context, schema);
  registerDefinitionTypes(context, schema, true);
  const output = mapType(context, schema, typeName);
  const input = mapType(context, schema, typeName, true);

  return { input, output };
}

export function buildRootUnionType(
  context: any,
  typeName: string,
  schema: any
) {
  const output = buildUnionType(context, typeName, schema);

  // There are no input union types in GraphQL
  // https://github.com/facebook/graphql/issues/488
  return { output, input: undefined };
}

export function convert(context: any, schema: any) {
  const typeName = schema.id || schema['$id'];
  validators.validateTopLevelId(typeName, schema);

  const typeBuilder = schema.switch ? buildRootUnionType : buildRootType;
  const { input, output } = typeBuilder(context, typeName, schema);

  context.types.set(typeName, output);
  if (input) {
    context.inputs.set(typeName, input);
  }

  return { output, input };
}

export function newContext() {
  return {
    types: new Map(),
    inputs: new Map(),
    enumTypes: new Map(),
    enumMaps: new Map(),
  };
}

export class UnknownTypeReference extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnknownTypeReference';
  }
}

export function getConvertEnumFromGraphQLCode(
  context: any,
  attributePath: string[]
) {
  const valueMap = context.enumMaps.get(attributePath);

  const cases = map(valueMap, function (jsonValue, graphQlValue) {
    return {
      type: 'SwitchCase',
      test: { type: 'Literal', value: graphQlValue },
      consequent: [
        {
          type: 'ReturnStatement',
          argument: { type: 'Literal', value: jsonValue },
        },
      ],
    };
  });

  const functionName = camelcase(`convert${attributePath}FromGraphQL`);

  const valueIdentifier = { type: 'Identifier', name: 'value' };
  return escodegen.generate({
    type: 'FunctionDeclaration',
    id: { type: 'Identifier', name: functionName },
    params: [valueIdentifier],
    body: {
      type: 'BlockStatement',
      body: [
        {
          type: 'SwitchStatement',
          discriminant: valueIdentifier,
          cases,
        },
      ],
    },
  });
}

export function convertSchemas(context: any, schemas: any) {
  const referencedUnknownType = [];
  let successful = 0;
  for (const schema of schemas) {
    try {
      convert(context, schema);
      successful++;
    } catch (error: any) {
      if (error instanceof UnknownTypeReference) {
        console.error(error);
        referencedUnknownType.push(schema);
        continue;
      }

      error.subMessage = error.subMessage
        ? error.subMessage
        : `Failed to convert schema ${schema.id}: ${error}`;
      throw error;
    }
  }

  if (successful > 0 && referencedUnknownType.length > 0) {
    convertSchemas(context, referencedUnknownType);
    return;
  }

  // If there is a type that was not handled, then attempt it
  // again just to generate an error for debugging
  if (referencedUnknownType.length > 0) {
    convert(context, referencedUnknownType[0]);
  }
}
