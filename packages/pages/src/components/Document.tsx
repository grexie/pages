import React, { FC, PropsWithChildren } from 'react';
import { Head, HeadProvider } from './Head';
import { createComposable } from '@grexie/compose';
import { Styles } from '../hooks/useStyles';

const Scripts = () => {
  return (
    <>
      <script src="./index.js" />
    </>
  );
};

export const Document: FC<PropsWithChildren<{}>> = ({ children }) => {
  return (
    <html>
      <Head></Head>
      <body>
        <HeadProvider>
          {children}
          <Head>
            <Styles />
          </Head>
          <Scripts />
        </HeadProvider>
      </body>
    </html>
  );
};

export const withDocumentComponent = createComposable(Document);
