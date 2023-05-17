import type { AppProps } from 'next/app';
import { DocumentContent } from '@grexie/pages';

const App = ({ Component, pageProps }: AppProps) => {
  return (
    <DocumentContent>
      <Component {...pageProps} />
    </DocumentContent>
  );
};

export default App;
