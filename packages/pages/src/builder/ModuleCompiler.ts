import type { ModuleContext } from './ModuleContext';
import { transformAsync } from '@babel/core';
import _traverse from '@babel/traverse';
import * as t from '@babel/types';
import babelPresetEnv from '@babel/preset-env';

type Traverse = typeof _traverse;

const { default: traverse } = _traverse as unknown as { default: Traverse };

export interface ModuleCompilerOptions {
  context: ModuleContext;
}

export interface ModuleCompileOptions {
  presets?: any[];
  source: string;
  filename: string;
}

export interface ModuleCompileResult {
  filename: string;
  source: string;
  imports: string[];
}

export class ModuleCompiler {
  readonly context: ModuleContext;

  constructor({ context }: ModuleCompilerOptions) {
    this.context = context;
  }

  async compile({ source, filename, presets = [] }: ModuleCompileOptions) {
    const transpiled = await transformAsync(source, {
      ast: true,
      presets: [
        ...presets,
        [
          babelPresetEnv,
          {
            modules: 'commonjs',
          },
        ],
      ],
      plugins: [],
      include: () => true,
      exclude: [],
      filename,
    });

    const imports: string[] = [];

    traverse(transpiled!.ast!, {
      CallExpression: path => {
        if (
          t.isIdentifier(path.node.callee, {
            name: 'require',
          })
        ) {
          const id = path.node.arguments[0];

          if (t.isStringLiteral(id)) {
            imports.push(id.value);
          }
        }
      },
    });

    return { filename, source: transpiled!.code!, imports };
  }
}
