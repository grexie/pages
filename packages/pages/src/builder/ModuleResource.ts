import { PluginObj, PluginPass, transformAsync } from '@babel/core';
import {
  ResourceMetadata,
  ResourceSerializeOptions,
  ResourceOptions,
  Resource,
} from '../api';
import type babel from '@babel/core';

const handlerResourcePlugin: (b: typeof babel) => PluginObj<PluginPass> = ({
  types: t,
}) => ({
  visitor: {
    ExportDefaultDeclaration(path) {
      path.replaceWith(
        t.assignmentExpression(
          '=',
          t.memberExpression(
            t.identifier('__handler_exports'),
            t.identifier('default')
          ),
          path.node.declaration as any
        )
      );
    },
    ExportNamedDeclaration(path) {
      path.replaceWith(
        t.assignmentExpression(
          '=',
          t.memberExpression(
            t.identifier('__handler_exports'),
            path.node.specifiers[0].exported
          ),
          path.node.declaration as any
        )
      );
    },
  },
});

export interface ModuleResourceOptions<
  X = any,
  M extends ResourceMetadata = any
> extends ResourceOptions<M> {
  source: string;
  exports: X;
}

export class ModuleResource<
  X = any,
  M extends ResourceMetadata = any
> extends Resource<M> {
  readonly #source: string;
  readonly exports: X;

  constructor({ source, exports, ...options }: ModuleResourceOptions<X, M>) {
    super(options);
    this.#source = source;
    this.exports = exports;
  }

  async serialize({
    serializeMetadata,
  }: ResourceSerializeOptions): Promise<string> {
    const compiled = await transformAsync(this.#source, {
      plugins: [handlerResourcePlugin],
    });

    return `const __handler_exports = {};
      ${compiled!.code}\nexport const resource = {
      path: ${JSON.stringify(this.path)},
      slug: ${JSON.stringify(this.slug)},
      metadata: ${serializeMetadata(JSON.stringify(this.metadata, null, 2))},
      exports: __handler_exports,
    };`;
  }
}
