import React, { FC, PropsWithChildren } from 'react';
import { Head, HeadProvider } from './Head';
import { createComposable } from '@grexie/compose';

export const Document: FC<PropsWithChildren<{}>> = ({ children }) => {
  const metadata = {} as any; //useResourceMetadata();

  return (
    <html>
      <Head>{metadata.title && <title>{metadata.title}</title>}</Head>
      <body>
        <HeadProvider>{children}</HeadProvider>
      </body>
    </html>
  );
};

export const withDocumentComponent = createComposable(Document);
