import type { ModuleContext } from './ModuleContext.js';
import { parseAsync } from '@babel/core';
import traverse from '@babel/traverse';
import * as t from '@babel/types';
import babelPresetEnv from '@babel/preset-env';

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
    const transpiled = await parseAsync(source, {
      ast: true,
      presets: [
        ...presets,
        [
          babelPresetEnv,
          {
            modules: false,
          },
        ],
      ],
      plugins: [],
      include: () => true,
      exclude: [],
      filename,
    });

    const imports: string[] = [];

    traverse(transpiled, {
      CallExpression: (path: any) => {
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
      ImportDeclaration: (path: any) => {
        imports.push(path.node.source.value);
      },
      ExportAllDeclaration: (path: any) => {
        imports.push(path.node.source.value);
      },
      ExportNamedDeclaration: (path: any) => {
        if (path.node.source) {
          imports.push(path.node.source.value);
        }
      },
    });

    return { filename, imports };
  }
}
