import { DocumentRoot, DocumentHead } from '@grexie/pages';
import { Html, Head, Main, NextScript } from 'next/document';
import { FC } from 'react';

const Document: FC<{}> = () => {
  return (
    <DocumentRoot>
      <Html lang="en">
        <Head>
          <DocumentHead />
        </Head>
        <body>
          <Main />
          <NextScript />
        </body>
      </Html>
    </DocumentRoot>
  );
};

export default Document;
