import { FC, PropsWithChildren } from 'react';
import { Head, HeadProvider } from './Head.js';
import { createComposable } from '@grexie/compose';
import { Styles } from '../hooks/useStyles.js';
import { useContext, useDocumentContext } from '../index.js';
import { BuildContext } from '../builder/index.js';
import { useScripts } from '../hooks/useScripts.js';

const Scripts = () => {
  // const { resource } = useDocumentContext();
  const scripts = useScripts();
  const data = { slug: '' };

  return (
    <>
      <script
        dangerouslySetInnerHTML={{
          __html: `\nvar __PAGES_DATA__ = ${JSON.stringify(data)};\n`,
        }}
      />
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
