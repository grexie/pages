import { PluginObj, PluginPass, transformAsync } from '@babel/core';
import {
  ResourceMetadata,
  ResourceSerializeOptions,
  ResourceOptions,
  Resource,
} from '@grexie/pages/api';
import type * as babel from '@babel/core';

const handlerResourcePlugin: (b: typeof babel) => PluginObj<PluginPass> = ({
  types: t,
}) => ({
  visitor: {
    ExportDefaultDeclaration(path: any) {
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
    ExportNamedDeclaration(path: any) {
      if (path.node.declaration) {
        path.replaceWithMultiple(
          path.node.declaration.declarations
            .map((declaration: any) => {
              return [
                t.variableDeclaration('const', [
                  t.variableDeclarator(declaration.id, declaration.init),
                ]),
                t.assignmentExpression(
                  '=',
                  t.memberExpression(
                    t.identifier('__handler_exports'),
                    declaration.id
                  ),
                  declaration.id
                ),
              ];
            })
            .reduce((a: any[], b: any[]) => [...a, ...b], [])
        );
      } else {
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
      }
    },
  },
});

export interface ModuleResourceOptions<
  X = any,
  M extends ResourceMetadata = any
> extends ResourceOptions<M> {
  source: string;
  map?: any;
  exports: X;
}

export class ModuleResource<
  X = any,
  M extends ResourceMetadata = any
> extends Resource<M> {
  readonly #source: string;
  readonly #map: string;
  readonly exports: X;

  constructor({
    source,
    map,
    exports,
    ...options
  }: ModuleResourceOptions<X, M>) {
    super(options);
    this.#source = source;
    this.#map = map;
    this.exports = exports;
  }

  async serialize({
    serializeMetadata,
    imports,
  }: ResourceSerializeOptions): Promise<{ code: string; map?: any }> {
    if (imports) {
      return { code: '' };
    } else {
      const compiled = await transformAsync(this.#source, {
        plugins: [handlerResourcePlugin],
      });

      return {
        code: `
      const __handler_exports = {};

      ${compiled!.code}

      export const resource = {
        path: ${JSON.stringify(this.path)},
        slug: ${JSON.stringify(this.slug)},
        metadata: ${serializeMetadata(JSON.stringify(this.metadata, null, 2))},
        exports: __handler_exports,
      };
    `,
        map: this.#map,
      };
    }
  }
}
