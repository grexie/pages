// Schema must contain an id or $id key to give it a graphQL type name, and top-level schema must be object type
export function validateTopLevelId(typeName: string, schema: any) {
  if (!typeName) {
    const err: any = new Error(
      `JSON-Schema must have a key 'id' or '$id' to identify the top-level schema`
    );
    err.subLocation = `JSON schema starting with ${JSON.stringify(
      schema
    ).substring(0, 25)}...`;
    throw err;
  }

  if (schema.type !== 'object') {
    const err: any = new Error(
      `Top-level type must be 'object', not '${schema.type}'`
    );
    err.subLocation = `JSON schema starting with ${JSON.stringify(
      schema
    ).substring(0, 25)}...`;
    throw err;
  }
}

export function validateTypeName(typeName: string, normalizedTypeName: string) {
  if (!/^[_a-zA-Z][_a-zA-Z0-9]*$/.test(normalizedTypeName)) {
    const err: any = new Error(
      `The id of ${typeName} does not convert into a valid GraphQL type name`
    );
    err.subMessage = `The ID or .json file-name must match the regular expression /^[_a-zA-Z][_a-zA-Z0-9]*$/ but ${normalizedTypeName} does not`;
    throw err;
  }
}

// If there are definitions, each definition must have a type defined
export function validateDefinitions(definitions: any) {
  for (const key in definitions) {
    // eslint-disable-next-line security/detect-object-injection
    if (!definitions[key].type) {
      const err: any = new Error(
        `Each key in definitions must have a declared type`
      );
      err.subLocation = `Definition for "${key}" schema`;
      throw err;
    }
  }
}
