import { Provider, ContextOptions } from '../api';
import { BuildContext } from '../builder';

export default async () => {
  const context = new BuildContext({
    providers: [
      {
        provider: Provider,
      },
    ],
  });

  let sources = await context.registry.list();
  const stats = await context.builder.build(sources);
  console.info(stats.toString());
};
