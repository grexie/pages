import { BuildContext } from './BuildContext';
import { Provider, ResourceMetadata } from '../api';
import { vol, Volume } from 'memfs';
import { FileSystem, WritableFileSystem } from '@grexie/builder';
import path from 'path';
import { Config } from './ConfigContext';
import YAML from 'yaml';
import fs from 'fs';

export class JSXSource {
  readonly builder: MockBuilder;
  readonly filename: string;
  readonly jsx: string;
  readonly imports: { importName: string; name: string; path: string }[] = [];
  readonly metadata: ResourceMetadata;
  readonly _code: string[] = [];
  readonly decorators: string[] = [];

  constructor(
    builder: MockBuilder,
    filename: string,
    jsx: string,
    metadata: ResourceMetadata
  ) {
    this.builder = builder;
    this.filename = filename;
    this.jsx = jsx;
    this.metadata = metadata;
  }

  code(code: string) {
    this._code.push(code);
    return this;
  }

  decorate(decorator: string) {
    this.decorators.push(decorator);
    return this;
  }

  importDefault(path: string, name: string) {
    this.imports.push({ importName: 'default', name, path });
    return this;
  }

  import(path: string, importName: string, name: string = importName) {
    this.imports.push({ importName, name, path });
    return this;
  }

  write() {
    const decorate = (
      code: string,
      decorators: string[] = this.decorators.slice()
    ): string => {
      let decorator = decorators.pop();
      if (!decorator) {
        return code;
      }

      return decorate(`${decorator}(${code})`, decorators);
    };
    const source = `
import React from 'react';
${this.imports
  .map(({ importName, name, path }) => {
    if (importName === 'default') {
      return `import ${name} from ${JSON.stringify(path)};`;
    } else if (importName === name) {
      return `import { ${name} } from ${JSON.stringify(path)};`;
    } else {
      return `import { ${importName} as ${name} } from ${JSON.stringify(
        path
      )};`;
    }
  })
  .join('\n')}

export default ${decorate(`({ children }) => {
  ${this._code.join('\n')}
  return (
    ${this.jsx}
  );
}`)};

export const resource = async (context) => {
  Object.assign(context.metadata, ${JSON.stringify(this.metadata)});
  return context.create();
}
`;
    this.builder.write(this.filename, source);
    return source;
  }
}

export interface MockBuilderOptions {
  builder?: MockBuilder;
  clean?: boolean;
}

export class MockBuilder extends BuildContext {
  constructor({ builder, clean = true }: MockBuilderOptions = {}) {
    const providers = [
      {
        provider: Provider,
      },
    ];
    let volume = builder?.defaultFiles ?? (new Volume() as WritableFileSystem);
    let rootDir = '/pages';

    if (process.env.PAGES_TEST_ROOT) {
      process.env.PAGES_CACHE = path.join(
        process.env.PAGES_TEST_ROOT,
        '.cache'
      );
      process.env.GREXIE_BUILDER_CACHE_HASH = 'false';
      rootDir = path.resolve(process.cwd(), process.env.PAGES_TEST_ROOT);
      volume = fs;
    }

    super({
      rootDir,
      fs: volume,
      defaultFiles: volume,
      providers,
    });
    this.defaultFiles = volume;
    if (clean) {
      volume.rmSync(this.rootDir, { recursive: true, force: true });
    }
    volume.mkdirSync(this.rootDir, { recursive: true });
    this.fs.add(path.resolve(this.pagesDir, '..', '..'), fs);
    this.fs.add(this.outputDir, volume, true);
  }

  create(options: Omit<MockBuilderOptions, 'builder'> = {}) {
    return new MockBuilder({ builder: this, ...options });
  }

  write(filename: string, data: Buffer | string) {
    this.builder.defaultFiles.mkdirSync(
      path.dirname(path.resolve(this.rootDir, filename)),
      { recursive: true }
    );
    return this.builder.defaultFiles.writeFileSync(
      path.resolve(this.rootDir, filename),
      data
    );
  }

  touchAll(dirname: string = this.rootDir) {
    this.builder.fs.readdirSync(dirname).forEach((file: any) => {
      const filename = path.resolve(
        dirname,
        file.name ? file.name : file.toString()
      );

      if ([this.cacheDir, this.outputDir].includes(filename)) {
        return;
      }

      const stats = this.builder.fs.statSync(filename);

      if (stats.isDirectory()) {
        this.touchAll(filename);
      } else {
        this.touch(filename);
      }
    });
  }

  touch(filename: string) {
    filename = path.resolve(this.rootDir, filename);
    this.builder.defaultFiles.writeFileSync(
      filename,
      this.builder.defaultFiles.readFileSync(filename)
    );
  }

  cleanOutput() {
    this.builder.fs.rmSync(this.outputDir, { recursive: true, force: true });
  }

  addSource(filename: string, jsx: string, metadata: ResourceMetadata = {}) {
    return new JSXSource(this, filename, jsx, metadata);
  }

  addConfig(filename: string, config: Config) {
    return this.write(filename, YAML.stringify(config));
  }

  output() {
    const out: { filename: string; data: string }[] = [];
    const stack: string[] = [this.outputDir];
    let el: string | undefined;
    while ((el = stack.shift())) {
      const files = this.fs.readdirSync(el);
      files.forEach((file: any) => {
        const filename = path.resolve(
          el!,
          file.name ? file.name : file.toString()
        );
        const stats = this.fs.statSync(filename);
        if (stats.isDirectory()) {
          stack.push(filename);
        } else {
          const data = this.fs.readFileSync(filename).toString();
          out.push({ filename: path.relative(this.outputDir, filename), data });
        }
      });
    }
    out.sort((a, b) => a.filename.length - b.filename.length);
    return out;
  }

  async build() {
    let sources = await this.registry.list();
    const stats = await this.builder.build(sources);

    if (stats.hasErrors()) {
      throw stats.compilation.errors;
    }
    return stats;
  }

  async watch() {
    let sources = await this.registry.list();
    return this.builder.watch(sources);
  }
}
