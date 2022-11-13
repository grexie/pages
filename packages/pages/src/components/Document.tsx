import { FC, PropsWithChildren, Suspense } from 'react';
import { HeadProvider, useHead, withHead } from './Head.js';
import { createComposable } from '@grexie/compose';
import { Styles, useStyles } from '../hooks/useStyles.js';
import { useResource } from '../hooks/useResource.js';
import { useScripts } from '../hooks/useScripts.js';
import { useLazyComplete } from '../index.js';

export interface DocumentHeadProps {}

export const DocumentHead: FC<PropsWithChildren<DocumentHeadProps>> = ({
  children,
}) => {
  const Head = useLazyComplete(
    async () => () => {
      const head = useHead().root;
      return <head>{head.render()}</head>;
    },
    []
  );

  return (
    <Suspense>
      <Head />
    </Suspense>
  );
};

const Scripts: FC<{}> = () => {
  const { slug } = useResource();
  const scripts = useScripts();
  const styles = useStyles();
  const data = {
    slug,
    styles: [...styles].map(({ hash, css }) => ({ hash, css })),
  };

  return (
    <>
      <script
        dangerouslySetInnerHTML={{
          __html: `\nvar __PAGES_DATA__ = ${JSON.stringify(data, null, 2)};\n`,
        }}
      />
      {scripts.map(script => (
        <script src={script} key={script} />
      ))}
    </>
  );
};

export interface DocumentRootProps {
  id?: string;
}

export const DocumentRoot: FC<PropsWithChildren<DocumentRootProps>> = ({
  children,
  id = '__pages_root',
}) => {
  return (
    <>
      <div id={id}>
        <DocumentContent>{children}</DocumentContent>
      </div>
      <Scripts />
    </>
  );
};

export interface DocumentContentProps {}

export const DocumentContent: FC<PropsWithChildren<DocumentContentProps>> =
  withHead(({ children }) => {
    return (
      <HeadProvider>
        {children}
        <Styles />
      </HeadProvider>
    );
  });

export const Document: FC<PropsWithChildren<{}>> = withHead(({ children }) => {
  return (
    <html>
      <DocumentHead></DocumentHead>
      <body>
        <DocumentRoot>{children}</DocumentRoot>
      </body>
    </html>
  );
});

export const withDocumentComponent = createComposable(Document);
export const withDocumentContent = createComposable(DocumentContent);
