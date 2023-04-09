import glob from 'glob';
import * as _path from 'path';
import { promisify } from 'util';
import { Source } from './Source.js';
import { createResolver, ResolvablePromise } from '@grexie/resolvable';
import { ProviderOptions, ListOptions } from './Registry.js';
import { BuildContext } from './BuildContext.js';

const globAsync = promisify(glob);

export class Provider {
  readonly context: BuildContext;
  readonly rootDir: string;
  readonly parentRootDir: string;
  readonly basePath: string[];
  priority: number;
  #scanning: boolean = false;
  #sources: ResolvablePromise<Record<string, Source[]>>;
  #configs: ResolvablePromise<Record<string, Source[]>>;

  constructor({
    context,
    rootDir = context.rootDir,
    parentRootDir = context.rootDir,
    basePath = [],
    priority = 0,
  }: ProviderOptions) {
    this.context = context;
    this.parentRootDir = parentRootDir;
    this.rootDir = rootDir;
    this.basePath = basePath;
    this.priority = priority;

    this.#sources = createResolver();
    this.#configs = createResolver();
  }

  private async create(
    filename: string,
    rootDir: string
  ): Promise<Source | undefined> {
    let path = this.context.builder.filenameToPath(
      _path.resolve(rootDir, filename),
      rootDir
    );
    path.unshift(...this.basePath);

    filename = _path.relative(
      this.context.root.rootDir,
      _path.resolve(this.rootDir, filename)
    );
    if (!filename.startsWith('../')) {
      filename = `./${filename}`;
    }

    const isPagesConfig = this.context.providerConfig.configExtensions?.reduce(
      (a, b) => a || filename.endsWith(b),
      false
    );

    const source = new Source({
      context: this.context,
      filename,
      path,
      isPagesConfig,
      priority: this.priority,
    });

    return source;
  }

  private async scan(): Promise<void> {
    if (this.#scanning) {
      return;
    }
    this.#scanning = true;

    try {
      const ignore = [
        '**/*.scss',
        '**/*.css',
        '**/*.d.ts',
        'node_modules/**',
        '.git/**',
        '.github/**',
        'package.json',
        '.gitignore',
        '.DS_Store',
        'yarn-error.log',
        'yarn.lock',
        'package-lock.json',
        ...(this.context.providerConfig.exclude ?? []),
      ];

      if (this.context.outputDir.startsWith(this.rootDir)) {
        ignore.push(
          _path.relative(this.rootDir, _path.join(this.context.outputDir, '**'))
        );
      }

      if (this.context.cacheDir.startsWith(this.rootDir)) {
        ignore.push(
          _path.relative(this.rootDir, _path.join(this.context.cacheDir, '**'))
        );
      }

      const files = (await globAsync(
        `**/*{${[
          ...(this.context.providerConfig.extensions ?? []),
          ...(this.context.providerConfig.configExtensions ?? []),
        ]
          .map(ext => ext.substring(1))
          .join(',')}}`,
        {
          cwd: this.rootDir,
          nodir: true,
          dot: true,
          fs: this.context.fs as any,
          ignore,
        }
      )) as string[];

      const sources = await Promise.all(
        files.map(async (filename: string) =>
          this.create(filename, this.context.root.rootDir)
        )
      );

      this.#sources.resolve(
        (
          sources.filter(
            source => !!source && !source.isPagesConfig
          ) as Source[]
        ).reduce((resources: Record<string, Source[]>, resource) => {
          const slug = resource.path.join('/');
          return {
            ...resources,
            [slug]: [...(resources[slug] ?? []), resource],
          };
        }, {})
      );

      this.#configs.resolve(
        (
          sources.filter(source => !!source && source.isPagesConfig) as Source[]
        ).reduce((resources: Record<string, Source[]>, resource) => {
          const slug = resource.path.join('/');
          return {
            ...resources,
            [slug]: [...(resources[slug] ?? []), resource],
          };
        }, {})
      );
    } catch (err) {
      console.error(err);
    }
  }

  async list({ path, slug }: ListOptions = {}): Promise<Source[]> {
    await this.scan();

    let sourcesMap = await this.#sources;
    let sources = Object.values(sourcesMap).reduce((a, b) => [...a, ...b], []);

    if (typeof path !== 'undefined') {
      if (typeof path[0] === 'string') {
        path = [path as string[]];
      }
      if (path.length === 0) {
        path = [[]];
      }
      slug = path.map(path => (path as string[]).join('/'));
    }
    if (typeof slug !== 'undefined') {
      if (typeof slug === 'string') {
        slug = [slug];
      }

      if (slug.length === 1) {
        sources = sourcesMap[slug[0]] ?? [];
      } else {
        const slugMap: Record<string, boolean> = slug.reduce(
          (a, b) => ({ ...a, [b]: true }),
          {}
        );
        sources = sources.filter(source => slugMap[source.slug]);
      }
    }

    return sources;
  }

  async listConfig({ path, slug }: ListOptions = {}): Promise<Source[]> {
    await this.scan();

    let sourcesMap = await this.#configs;
    let sources = Object.values(sourcesMap).reduce((a, b) => [...a, ...b], []);

    if (typeof slug !== 'undefined') {
      if (typeof slug === 'string') {
        slug = [slug];
      }

      path = slug.map(slug => slug.split(/\//g));
    }
    if (typeof path !== 'undefined') {
      if (typeof path[0] === 'string') {
        path = [path as string[]];
      }
      if (path.length === 0) {
        path = [[]];
      }

      sources = sources.filter(source => {
        const includes = (path as string[][]).map(path => {
          const sourcePath = source.path.slice();
          path = path.slice();

          if (sourcePath.length > path.length) {
            return false;
          }

          for (let i = 0; i < sourcePath.length; i++) {
            if (sourcePath[i] !== path[i]) {
              return false;
            }
          }

          return true;
        });
        return includes.reduce((a, b) => a || b, false);
      });
    }

    return sources;
  }

  async has(path: string[]): Promise<boolean> {
    this.scan();

    const filepath = path.join('/');
    const resources = await this.#sources;
    return filepath in resources;
  }
}
