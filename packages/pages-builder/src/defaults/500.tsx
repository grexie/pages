import { SourceContext } from '../SourceContext.js';
import styles from './ErrorPage.module.scss';

export default () => {
  styles.use();

  return (
    <div className={styles('container')}>
      <span className={styles('code')}>500</span>
      <span className={styles('message')}>Server Error</span>
    </div>
  );
};

export const resource = (context: SourceContext) => {
  Object.assign(context.config, {
    layout: null,
  });

  return context.create();
};
