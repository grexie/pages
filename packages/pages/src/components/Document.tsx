import { FC, PropsWithChildren } from 'react';
import {
  HeadContext,
  HeadProvider,
  HeadProviderContext,
  useHead,
  withHead,
} from './Head.js';
import {
  Styles,
  StylesContext,
  StylesProvider,
  withStyles,
} from '../hooks/useStyles.js';
import { useLazyComplete, withLazy } from '../hooks/useLazy.js';
import { compose } from '@grexie/compose';
import { withFirstRenderProvider } from '../hooks/useFirstRender.js';

export interface DocumentHeadProps {}

export const DocumentHead: FC<DocumentHeadProps> = ({}) => {
  const Head = useLazyComplete(
    async () => () => {
      const head = useHead().root;

      return <>{head.render()}</>;
    },
    []
  );

  return <Head />;
};

export interface DocumentContentProps {}

const headStore = {} as { head: HeadContext };

const _DocumentContent: FC<PropsWithChildren<DocumentContentProps>> = ({
  children,
}) => {
  headStore.head = useHead();

  return (
    <HeadProvider>
      {children}
      <Styles />
    </HeadProvider>
  );
};

const styles = new StylesContext();

export const DocumentContent: FC<PropsWithChildren<DocumentContentProps>> =
  compose(
    withLazy,
    withFirstRenderProvider,
    withHead,
    withStyles({ styles }),
    _DocumentContent
  ) as any;

const _DocumentRoot: FC<PropsWithChildren> = ({ children }) => {
  return (
    <HeadProviderContext.Provider value={headStore.head}>
      <StylesProvider styles={styles}>{children}</StylesProvider>
    </HeadProviderContext.Provider>
  );
};

export const DocumentRoot: FC<PropsWithChildren> = compose(
  withLazy,
  _DocumentRoot
) as any;
