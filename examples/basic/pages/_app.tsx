import { DocumentContent } from '@grexie/pages';
import { ComponentType } from 'react';

export interface AppProps<T = any> {
  Component: ComponentType<T>;
  pageProps: T;
}

const App = ({ Component, pageProps }: AppProps) => {
  return (
    <DocumentContent>
      <Component {...pageProps} />
    </DocumentContent>
  );
};

export default App;
