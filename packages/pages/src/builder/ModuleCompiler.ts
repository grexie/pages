import type { ModuleContext } from './ModuleContext';
import { transformAsync, traverse, types as t } from '@babel/core';

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
          require('@babel/preset-env'),
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
