import type { AppProps } from 'next/app';
import { withStyles, StylesContext, Styles } from '@grexie/pages';
import { compose } from '@grexie/compose';

const App = ({ Component, pageProps }: AppProps) => {
  return (
    <>
      <Component {...pageProps} />
      <Styles />
    </>
  );
};

export default compose(withStyles({ styles: new StylesContext() }), App);
