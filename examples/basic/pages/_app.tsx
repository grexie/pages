import type { AppProps } from 'next/app';
import { withStyles, StylesContext, Styles } from '@grexie/pages';
import { compose } from '@grexie/compose';
import { styles } from './_document';

const App = ({ Component, pageProps }: AppProps) => {
  return <Component {...pageProps} />;
};

export default compose(withStyles({ styles }), App);
