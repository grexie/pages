import { LoaderContext } from 'webpack';
import { offsetLines } from '@grexie/source-maps';
import { createResolver } from '@grexie/resolvable';
import { createHash } from 'crypto';
import { parse as parseCSS } from 'css';
import { default as traverse } from 'ast-traverse';
import { createRequire } from 'module';

export default async function StyleLoader(
  this: LoaderContext<void>,
  content: Buffer,
  inputSourceMap: any
) {
  if (process.env.PAGES_DEBUG_LOADERS === 'true') {
    console.debug('style-loader', this.resourcePath);
  }
  const resolver = createResolver();
  // context.modules.addBuild(this.resourcePath, resolver);
  const callback = this.async();

  // const factory = context.modules.createModuleFactory(this._compilation!);

  try {
    const require = createRequire(this.resourcePath);
    const module: any = {
      id: this.resourcePath,
      exports: {},
      require,
    };

    new Function('module', 'exports', 'require', content.toString())(
      module,
      module.exports,
      require
    );

    const styles = module.exports;
    const css = styles.toString();
    const variables = parseVariables(css, this.resourcePath);

    const { locals } = styles;
    const hash = createHash('md5').update(this.resourcePath).digest('hex');
    const chunk = `
    import { wrapStyles } from '@grexie/pages-runtime-styles';
    export default wrapStyles(${JSON.stringify(hash)}, ${JSON.stringify(
      css
    )}, ${JSON.stringify(locals, null, 2)}, ${JSON.stringify(variables)}); 
  `;

    callback(null, chunk);
  } catch (err) {
    callback(err as any);
    resolver.reject(err);
  } finally {
    if (process.env.PAGES_DEBUG_LOADERS === 'true') {
      console.debug('style-loader:complete', this.resourcePath);
    }

    resolver.resolve();
  }
}

export const parseVariables = (css: string, resourcePath: string) => {
  const ast = parseCSS(css, {
    source: resourcePath,
  });

  const variables: Record<string, string> = {};

  traverse(ast, {
    pre: (node: any, parent: any) => {
      if (node.type === 'stylesheet') {
        node.children = node.stylesheet.rules;
      }
      if (
        node.type === 'declaration' &&
        node.property.startsWith('--') &&
        parent.selectors.includes(':root')
      ) {
        variables[node.property] = node.value;
      }
    },
  });

  return variables;
};
