import glob from 'glob';
import _path from 'path';
import { promisify } from 'util';
import { Source } from './Source';
import { createResolver, ResolvablePromise } from '../utils/resolvable';
import { ProviderOptions, ListOptions } from './Registry';
import { BuildContext } from '../builder/BuildContext';

const globAsync = promisify(glob);

export class Provider {
  readonly context: BuildContext;
  #sources: ResolvablePromise<Record<string, Source>>;

  constructor({ context }: ProviderOptions) {
    this.context = context;

    this.#sources = createResolver();
    this.scan();
  }

  private async create(
    filename: string,
    rootDir: string
  ): Promise<Source | undefined> {
    const path = this.context.builder.filenameToPath(filename, rootDir);

    return new Source({
      filename,
      path,
    });
  }

  private async scan(): Promise<void> {
    const files = await globAsync('**/*', {
      cwd: this.context.rootDir,
      nodir: true,
      dot: true,
      ignore: [
        _path.relative(
          this.context.rootDir,
          _path.join(this.context.outputDir, '**')
        ),
        _path.relative(
          this.context.rootDir,
          _path.join(this.context.cacheDir, '**')
        ),
        'node_modules/**',
        '.git/**',
        '.github/**',
        '.gitignore',
        'yarn-error.log',
        'yarn.lock',
        'package-lock.json',
      ],
    });

    this.#sources.resolve(
      (
        (
          await Promise.all(
            files.map(async filename =>
              this.create(
                _path.resolve(this.context.rootDir, filename),
                process.cwd()
              )
            )
          )
        ).filter(source => !!source) as Source[]
      ).reduce(
        (resources, resource) => ({
          ...resources,
          [resource.path.join('/')]: resource,
        }),
        {}
      )
    );
  }

  async list({ type, path, slug }: ListOptions = {}): Promise<Source[]> {
    let sourcesMap = await this.#sources;
    let sources = Object.values(sourcesMap);

    // if (typeof type !== 'undefined') {
    //   if (typeof type === 'string') {
    //     type = [type];
    //   }
    //   const typeMap: Record<string, boolean> = type.reduce(
    //     (a, b) => ({ ...a, [b]: true }),
    //     {}
    //   );
    //   resources = (
    //     await Promise.all(
    //       resources.map(async resource => ({
    //         resource,
    //         metadata: await resource.metadata(),
    //       }))
    //     )
    //   )
    //     .filter(({ metadata }) => typeMap[metadata.type ?? ''])
    //     .map(({ resource }) => resource);
    // }
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

  async has(path: string[]): Promise<boolean> {
    const filepath = path.join('/');
    const resources = await this.#sources;
    return filepath in resources;
  }
}
