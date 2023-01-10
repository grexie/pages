import { Head } from '@grexie/pages';
import { SourceContext } from '../SourceContext.js';
import styles from './ErrorPage.module.scss';

export default () => {
  styles.use();

  return (
    <>
      <Head>
        <title>404 Not Found</title>
      </Head>
      <div className={styles('container')}>
        <span className={styles('code')}>404</span>
        <span className={styles('message')}>Not Found</span>
      </div>
    </>
  );
};

export const resource = (context: SourceContext) => {
  Object.assign(context.config, {
    layout: null,
  });

  return context.create();
};
