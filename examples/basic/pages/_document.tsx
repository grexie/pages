import { Styles, StylesContext, withStyles } from '@grexie/pages';
import { Html, Head, Main, NextScript } from 'next/document';
import { compose } from '@grexie/compose';
import { FC } from 'react';

export const styles = new StylesContext();

const Document: FC<{}> = () => {
  return (
    <Html lang="en">
      <Head>
        <Styles />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
};

export default compose(withStyles({ styles }), Document);
