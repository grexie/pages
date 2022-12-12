import { FC, PropsWithChildren, createElement } from 'react';
import { HeadProvider, useHead, withHead } from './Head.js';
import { createComposable } from '@grexie/compose';
import { Styles, useStyles } from '../hooks/useStyles.js';
import { useResource } from '../hooks/useResource.js';
import { useScripts } from '../hooks/useScripts.js';
import { useLazyComplete } from '../hooks/useLazy.js';

export interface DocumentHeadProps {}

export const DocumentHead: FC<DocumentHeadProps> = ({}) => {
  const Head = useLazyComplete(
    async () => () => {
      const head = useHead().root;

      return <head>{head.render()}</head>;
    },
    []
  );

  return <Head />;
};

interface ScriptsProps {
  data?: Record<string, any>;
}

const Scripts: FC<ScriptsProps> = ({ data = {} }) => {
  const { slug } = useResource();
  const scripts = useScripts();
  const styles = useStyles();
  data = {
    ...data,
    slug,
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
  tag?: string;
  id?: string;
}

export const DocumentRoot: FC<PropsWithChildren<DocumentRootProps>> = ({
  children,
  tag = 'div',
  id = '__pages_root',
}) => {
  const element = createElement(
    tag,
    { id },
    <DocumentContent>{children}</DocumentContent>
  );

  const data = { root: { tag, id } };

  return (
    <>
      {element}
      <Scripts data={data} />
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

export const DefaultDocument: FC<PropsWithChildren<{}>> = withHead(
  ({ children }) => {
    return (
      <html>
        <DocumentHead />
        <body>
          <DocumentRoot>{children}</DocumentRoot>
        </body>
      </html>
    );
  }
);

export const withDocumentComponent = createComposable(DefaultDocument);
export const withDocumentContent = createComposable(DocumentContent);
