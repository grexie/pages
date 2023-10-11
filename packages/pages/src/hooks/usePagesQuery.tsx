import { PropsWithChildren, createContext, useContext } from 'react';
import { Pages, PagesContextOptions } from '../graphql/index.js';
import { createComposableWithProps } from '@grexie/compose';
import { Head } from '../components/Head.js';

const PagesContext = createContext<Pages>(new Pages());
const PagesContextOptionsContext = createContext<PagesContextOptions | null>(
  null
);

export class QueryCollector {
  readonly data: Record<string, any> = {};
  readonly files = new Set<string>();

  add(query: string, data: any, filename?: string) {
    if (filename) {
      this.files.add(filename);
    }
    this.data[query] = data;
  }

  Component = () => {
    return (
      <Head>
        <script
          id="__PAGES_DATA__"
          type="application/json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(this.data),
          }}
        />
      </Head>
    );
  };
}

export const withPagesContext = createComposableWithProps<PagesContextOptions>(
  ({ children, ...props }: PropsWithChildren<PagesContextOptions>) => {
    const context = useContext(PagesContextOptionsContext);

    if (!context) {
      if (typeof window === 'undefined') {
        const queryCollector = new QueryCollector();
        props = {
          ...props,
          queryCollector: queryCollector,
          data: queryCollector.data,
        };
      } else {
        props = {
          ...props,
          data: JSON.parse(
            document.head.querySelector('script[id=__PAGES_DATA__]')
              ?.innerHTML ?? '{}'
          ),
        };
      }
    }

    props = {
      ...context,
      ...props,
      variables: { ...(context?.variables ?? {}), ...(props.variables ?? {}) },
    };

    return (
      <>
        <PagesContextOptionsContext.Provider value={props}>
          {children}
        </PagesContextOptionsContext.Provider>
        {!context && props.queryCollector && <props.queryCollector.Component />}
      </>
    );
  }
);

export const pages = <T extends any = any>(query: TemplateStringsArray): T => {
  return usePagesQuery<T>(query.join(''));
};

export const usePagesQuery = <T extends any = any>(
  query: string,
  options: PagesContextOptions = {}
): T => {
  const context = useContext(PagesContext);
  let contextOptions = useContext(PagesContextOptionsContext);
  contextOptions = { ...contextOptions, ...options };

  if (!contextOptions.data && !contextOptions.resources) {
    throw new Error(
      'neither resources nor hydration data available for pages query'
    );
  }

  return context!.query(query, context.createContext(contextOptions)) as T;
};
