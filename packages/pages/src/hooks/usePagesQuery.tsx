import {
  PropsWithChildren,
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
} from 'react';
import { Pages, PagesContextOptions } from '../graphql/index.js';
import { createComposableWithProps } from '@grexie/compose';
import { Head } from '../components/Head.js';
import { useRouter } from './useRouter.js';

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

export const useUpdatePagesContext = () =>
  useContext(PagesContextOptionsContext)?.update;

export const withPagesContext = createComposableWithProps<PagesContextOptions>(
  ({ children, ...props }: PropsWithChildren<PagesContextOptions>) => {
    const context = useContext(PagesContextOptionsContext);
    const [queryCollector] = useState<QueryCollector | undefined>(
      typeof window === 'undefined' ? () => new QueryCollector() : undefined
    );

    const getProps = (): any => {
      if (context) {
        return;
      }

      if (typeof window === 'undefined') {
        return {
          queryCollector,
          data: queryCollector!.data,
        };
      } else {
        return {
          data: JSON.parse(
            document.querySelector('script[id=__PAGES_DATA__]')?.innerHTML ??
              '{}'
          ),
          update: ({ shallow = false } = {}) => {
            const props = getProps();
            if (shallow) {
              setExtraProps((p: any) => ({
                data: { ...p.data, ...props.data },
              }));
            } else {
              setExtraProps(props);
            }
          },
        };
      }
    };

    const [extraProps, setExtraProps] = useState<any>(getProps());

    if (!context) {
      props = {
        ...props,
        ...extraProps,
      };
    }

    props = {
      ...context,
      ...props,
      variables: { ...(context?.variables ?? {}), ...(props.variables ?? {}) },
    };

    const router = useRouter();

    useEffect(() => {
      const trimBasePath = (href: string): string => {
        let basePath = router.basePath;
        if (basePath.endsWith('/')) {
          basePath = basePath.substring(0, basePath.length - 1);
        }

        href = href.substring(basePath.length);
        console.info(href);
        return href || '/';
      };

      router.beforePopState(({ url, as, options }): boolean => {
        (async () => {
          const [, response] = await Promise.all([
            router.prefetch(
              trimBasePath(url.toString()),
              trimBasePath(as),
              options
            ),
            fetch(as.toString()),
          ]);

          const html = await response.text();
          const doc = document.implementation.createHTMLDocument();
          doc.documentElement.innerHTML = html;

          const data = doc.querySelector('script[id=__PAGES_DATA__]')!;
          document.head.querySelector('script[id=__PAGES_DATA__]')!.innerHTML =
            data.innerHTML;

          props.update?.({ shallow: true });

          await router.replace(trimBasePath(url.toString()), trimBasePath(as), {
            shallow: true,
          });

          props.update?.();
        })();

        return false;
      });
    }, [router.pathname]);

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
