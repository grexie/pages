import React, { FC, PropsWithChildren } from 'react';
import { Head, HeadProvider } from './Head';
import { createComposable } from '@grexie/compose';

export const Document: FC<PropsWithChildren<{}>> = ({ children }) => {
  return (
    <html>
      <Head></Head>
      <body>
        <HeadProvider>{children}</HeadProvider>
      </body>
    </html>
  );
};

export const withDocumentComponent = createComposable(Document);
