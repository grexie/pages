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
  cloneElement,
} from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { useDocument } from '../hooks/useDocument.js';
import type { DocumentProps } from '../api/Document.js';
import { ClientSuspense, useLazyComplete } from '../hooks/useLazy.js';
import hash from 'object-hash';
import { useMountId } from '../hooks/useMountId.js';

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

const processChildren = (
  children: ReactNode,
  id: string,
  props: DocumentProps
) => {
  Children.toArray(children).forEach((child, index) => {
    if (Array.isArray(child)) {
      processChildren(child, `${id}:${index}`, props);
    } else if (typeof child === 'object' && child !== null) {
      processElement(child as ReactElement, `${id}:${index}`, props);
    }
  });
};

const processElement = (
  element: ReactElement,
  id: string,
  props: DocumentProps
) => {
  element = cloneElement(element, { 'data-pages-head': id });

  switch (element.type) {
    case 'title': {
      props.title = nodeToString(element.props.children);
      break;
    }
    default: {
      const index = props.children.findIndex(
        child =>
          child.props['data-pages-head'] === element.props['data-pages-head']
      );
      if (index !== -1) {
        props.children.splice(index, 1, element);
      } else {
        props.children.push(element);
      }
    }
  }
};

export const Head: FC<PropsWithChildren<{}>> = ({ children }) => {
  const renderHead = useHead();
  const id = useMountId();

  const props = useMemo(() => {
    const props = { children: [] };
    processChildren(children, id, props);
    return props;
  }, [renderHead, hash({ children }, { ignoreUnknown: true })]);

  const document = useDocument(props);

  useEffect(() => {
    const elements = Array.from(
      window.document.head.querySelectorAll('[data-pages-head]')
    );
    const children = document.props.children;

    const html = renderToStaticMarkup(<>{children}</>);
    const fragment = window.document.createDocumentFragment();
    const div = window.document.createElement('div');
    div.innerHTML = html;
    for (const el of Array.from(div.children)) {
      fragment.appendChild(el);
    }
    window.document.head.insertBefore(fragment, elements[0]);
    elements.forEach(element => element.remove());
  }, [hash(document.props, { ignoreUnknown: true })]);

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
