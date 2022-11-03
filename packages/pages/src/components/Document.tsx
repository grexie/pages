import { FC, PropsWithChildren } from 'react';
import { Head, HeadProvider } from './Head.js';
import { createComposable } from '@grexie/compose';
import { Styles } from '../hooks/useStyles.js';
import { useContext } from '../index.js';
import { BuildContext } from '../builder/index.js';
import { useScripts } from '../hooks/useScripts.js';

const Scripts = () => {
  const scripts = useScripts();

  return (
    <>
      {scripts.map(script => (
        <script src={script} key={script} />
      ))}
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
