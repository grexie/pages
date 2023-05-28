import { DocumentRoot, DocumentHead } from '@grexie/pages';
import { Html, Head, Main, NextScript } from 'next/document';
import { FC } from 'react';

const Document: FC<{}> = () => {
  const _Head = Head as any;
  const _NextScript = NextScript as any;
  return (
    <Html lang="en">
      <DocumentRoot>
        <_Head>
          <DocumentHead />
        </_Head>
        <body>
          <Main />
          <_NextScript />
        </body>
      </DocumentRoot>
    </Html>
  );
};

export default Document;
