import { Events, BuildContext, Configuration } from '@grexie/pages-builder';
import { createRequire } from 'module';

const require = createRequire(new URL(import.meta.url).pathname);

export default (context: Events<BuildContext>) => {
  context.builder.after('config', (config: Configuration) => {
    Object.assign(config.resolve!.alias!, {
      react: 'preact/compat',
      'react-dom': 'preact/compat',
    });
  });
};
