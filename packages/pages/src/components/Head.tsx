import {
  ReactNode,
  ReactElement,
  Children,
  FC,
  PropsWithChildren,
  useMemo,
  Fragment,
  createContext,
  useContext,
  useEffect,
  useState,
  lazy,
  Suspense,
} from 'react';
import { useDocument } from '../hooks/useDocument.js';
import type { DocumentProps } from '../api/Document.js';
import { ClientSuspense, useLazyComplete } from '../hooks/useLazy.js';
import hash from 'object-hash';

const HeadContext = createContext<boolean>(true);

export const HeadProvider: FC<PropsWithChildren<{}>> = ({ children }) => {
  return <HeadContext.Provider value={false}>{children}</HeadContext.Provider>;
};

const useHead = () => useContext(HeadContext);

const nodeToString = (children: ReactNode) => {
  const out: string[] = [];

  Children.toArray(children).forEach(child => {
    if (typeof child === 'boolean') {
      return;
    } else if (typeof child === 'string' || typeof child === 'number') {
      out.push(child.toString());
      return;
    } else if (Array.isArray(child)) {
      out.push(nodeToString(child));
      return;
    } else if (typeof child === 'object' && child !== null) {
      if ((child as any).type === Fragment) {
        out.push(nodeToString((child as any).props.children));
        return;
      }
    }

    throw new Error('children must be fragments, strings or numbers');
  });

  return out.join('');
};

const processChildren = (children: ReactNode, props: DocumentProps) => {
  Children.toArray(children).forEach(child => {
    if (Array.isArray(child)) {
      processChildren(child, props);
    } else if (typeof child === 'object' && child !== null) {
      processElement(child as ReactElement, props);
    }
  });
};

const processElement = (element: ReactElement, props: DocumentProps) => {
  switch (element.type) {
    case 'title': {
      props.title = nodeToString(element.props.children);
      break;
    }
    default: {
      props.children.push(element);
    }
  }
};

export const Head: FC<PropsWithChildren<{}>> = ({ children }) => {
  const renderHead = useHead();

  const props = useMemo(() => {
    const props = { children: [] };
    processChildren(children, props);
    return props;
  }, [renderHead, hash({ children }, { ignoreUnknown: true })]);

  useDocument(props);

  if (!renderHead) {
    return null;
  }

  const Head = useLazyComplete(
    async () => () => {
      const [, setState] = useState({});
      const document = useDocument();

      if (typeof window === 'undefined') {
        useMemo(() => {
          document.on('update', () => setState({}));
        }, []);
      } else {
        useEffect(() => {
          const handler = () => setState({});
          document.on('update', handler);
          return () => {
            document.removeListener('update', handler);
          };
        }, []);
      }

      return (
        <head>
          <meta charSet="utf-8" />
          {document.props.title && <title>{document.props.title}</title>}
          {document.props.children}
        </head>
      );
    },
    []
  );

  return <Head />;
};
