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
  readonly #exclude: string[];
  #scanning: boolean = false;
  #sources: ResolvablePromise<Record<string, Source>>;
  #configs: ResolvablePromise<Record<string, Source>>;

  constructor({ context, exclude = [] }: ProviderOptions) {
    this.context = context;

    this.#sources = createResolver();
    this.#configs = createResolver();
    this.#exclude = exclude;
  }

  private async create(
    filename: string,
    rootDir: string
  ): Promise<Source | undefined> {
    const path = this.context.builder.filenameToPath(filename, rootDir);
    filename = `./${_path.relative(this.context.rootDir, filename)}`;

    return new Source({
      context: this.context,
      filename,
      path,
    });
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
        ...this.#exclude,
      ];

      if (this.context.outputDir.startsWith(this.context.rootDir)) {
        ignore.push(
          _path.relative(
            this.context.rootDir,
            _path.join(this.context.outputDir, '**')
          )
        );
      }

      if (this.context.cacheDir.startsWith(this.context.rootDir)) {
        ignore.push(
          _path.relative(
            this.context.rootDir,
            _path.join(this.context.cacheDir, '**')
          )
        );
      }

      const files = await globAsync(
        `**/*.{${this.context.resolverConfig.extensions
          .map(ext => ext.substring(1))
          .join(',')}}`,
        {
          cwd: this.context.rootDir,
          nodir: true,
          dot: true,
          fs: this.context.fs as any,
          ignore,
        }
      );

      const sources = await Promise.all(
        files.map(async (filename: string) =>
          this.create(
            _path.resolve(this.context.rootDir, filename),
            this.context.rootDir
          )
        )
      );

      this.#sources.resolve(
        (
          sources.filter(
            source => !!source && !source.isPagesConfig
          ) as Source[]
        ).reduce(
          (resources, resource) => ({
            ...resources,
            [resource.path.join('/')]: resource,
          }),
          {}
        )
      );

      this.#configs.resolve(
        (
          sources.filter(source => !!source && source.isPagesConfig) as Source[]
        ).reduce(
          (resources, resource) => ({
            ...resources,
            [resource.path.join('/')]: resource,
          }),
          {}
        )
      );
    } catch (err) {
      console.error(err);
    }
  }

  async list({ path, slug }: ListOptions = {}): Promise<Source[]> {
    this.scan();

    let sourcesMap = await this.#sources;
    let sources = Object.values(sourcesMap);

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
        const resource = sourcesMap[slug[0]];
        sources = resource ? [resource] : [];
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
    this.scan();

    let sourcesMap = await this.#configs;
    let sources = Object.values(sourcesMap);

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
