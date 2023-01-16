import { SourceContext } from '../SourceContext.js';
import styles from './index.module.css';

export default () => {
  styles.use();

  return (
    <div className={styles('container')}>
      <h1>Grexie Pages</h1>
      <h3>Welcome to your new site!</h3>
      <p></p>
    </div>
  );
};

export const resource = (context: SourceContext) => {
  Object.assign(context.config, {
    layout: null,
  });

  return context.create();
};
