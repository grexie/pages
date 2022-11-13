import {
  ReactNode,
  ReactElement,
  FC,
  PropsWithChildren,
  useMemo,
  cloneElement,
  useState,
  useEffect,
  startTransition,
  Children,
  Fragment,
} from 'react';
import EventEmitter from 'events';
import { isElement, isFragment } from 'react-is';
import { hash } from '../utils/hash.js';
import { createContext } from '../utils/context.js';
import { setImmediate } from 'timers';
import { hydrateRoot, Root } from 'react-dom/client';

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

class HeadContext extends EventEmitter {
  readonly parent?: HeadContext;
  props: HeadProps = {};
  children: FC<{}>[] = [];

  constructor(parent?: HeadContext) {
    super();

    this.parent = parent;
    parent?.children.push(() => this.render());

    if (typeof window !== 'undefined' && !parent) {
      setImmediate(() => {
        const element = this.render();

        if ((window as any).__PAGES_HEAD__) {
          (window as any).__PAGES_HEAD__.render(this.render());
        } else {
          (window as any).__PAGES_HEAD__ = hydrateRoot(document.head, element);
        }

        this.on('update', () => {
          (window as any).__PAGES_HEAD__.render(this.render());
        });
      });
    }
  }

  setProps(props: HeadProps) {
    let children;

    const handleElement = (element: ReactElement, key?: number) => {
      if (element.type === 'title') {
        props.title = nodeToString(element.props.children);
        return <></>;
      }

      return cloneElement(
        element,
        typeof key !== 'undefined' ? { key: `${key}` } : {}
      );
    };

    if (Array.isArray(props.children)) {
      children = Children.map(props.children, (child, i) =>
        handleElement(child, i)
      );
    } else if (isFragment(props.children)) {
      children = (
        <>
          {Children.map(props.children.props.children, (child, i) =>
            handleElement(child, i)
          )}
        </>
      );
    } else if (isElement(props.children)) {
      children = handleElement(props.children);
    } else {
      children = props.children;
    }

    this.props = { ...props, children };

    startTransition(() => {
      this.root.emit('update');
    });
  }

  get root() {
    let context = this as HeadContext;
    while (context.parent) {
      context = context.parent!;
    }
    return context;
  }

  render(): ReactElement {
    return (
      <>
        {!!this.props.title && <title>{this.props.title}</title>}
        {this.props.children}
        {this.children.map((Child, i) => (
          <Child key={`${i}`} />
        ))}
      </>
    );
  }
}

export const {
  Provider: HeadProvider,
  use: _useHead,
  with: withHead,
} = createContext<HeadContext>(Provider => ({ children }) => {
  const parentContext = _useHead();
  const context = useMemo(() => new HeadContext(parentContext), []);
  return <Provider value={context}>{children}</Provider>;
});

export const useHead = () => {
  const head = _useHead();
  const [, setState] = useState({});

  if (typeof window === 'undefined') {
    useMemo(() => {
      head.root.on('update', () => {
        setImmediate(() => setState({}));
      });
    }, [head.root]);
  } else {
    useEffect(() => {
      const handler = () => {
        setImmediate(() => {
          startTransition(() => setState({}));
        });
      };
      head.root.on('update', handler);
      return () => {
        head.root.removeListener('update', handler);
      };
    }, [head.root]);
  }

  return head;
};

export interface HeadProps extends PropsWithChildren {
  title?: string;
}

export const Head: FC<HeadProps> = ({ children, ...props }) => {
  if (typeof window === 'undefined') {
    return <ServerHead {...props}>{children}</ServerHead>;
  } else {
    return <BrowserHead {...props}>{children}</BrowserHead>;
  }
};

export const { with: withHeadRendering, use: useHeadRendering } =
  createContext<boolean>(Provider => ({ children }) => (
    <Provider value={true}>{children}</Provider>
  ));

interface ServerHeadProps extends HeadProps {}

const ServerHead: FC<ServerHeadProps> = withHead(({ ...props }) => {
  const head = _useHead();

  useMemo(() => {
    head.setProps(props);
  }, [hash(props)]);

  return null;
});

interface BrowserHeadProps extends HeadProps {}

const BrowserHead: FC<BrowserHeadProps> = withHead(({ ...props }) => {
  const head = _useHead();

  useEffect(() => {
    head.setProps(props);
  }, [hash(props)]);

  return null;
});

// const processChildren = (
//   children: ReactNode,
//   id: string,
//   props: DocumentProps
// ) => {
//   Children.toArray(children).forEach((child, index) => {
//     if (Array.isArray(child)) {
//       processChildren(child, `${id}:${index}`, props);
//     } else if (typeof child === 'object' && child !== null) {
//       processElement(child as ReactElement, `${id}:${index}`, props);
//     }
//   });
// };

// const processElement = (
//   element: ReactElement,
//   id: string,
//   props: DocumentProps
// ) => {
//   element = cloneElement(element, { 'data-pages-head': id });

//   switch (element.type) {
//     case 'title': {
//       mergeDocumentProps(props, {
//         title: nodeToString(element.props.children),
//       });
//       break;
//     }
//     default: {
//       mergeDocumentProps(props, { children: [element] });
//     }
//   }
// };

// const updateHead = (document: Document) => {
//   const elements = Array.from(
//     window.document.querySelectorAll('head [data-pages-head]')
//   );

//   const html = renderToStaticMarkup(<>{document.props.children}</>);
//   const fragment = window.document.createDocumentFragment();
//   const div = window.document.createElement('div');
//   div.innerHTML = html;
//   for (const el of Array.from(div.children)) {
//     fragment.appendChild(el);
//   }

//   window.document.head.insertBefore(fragment, elements[0]);
//   elements.forEach(element => element.parentNode?.removeChild(element));
// };

// const HeadContent: FC<PropsWithChildren<{}>> = ({ children }) => {
//   const id = useMountId();

//   const props = useMemo(() => {
//     const props = { children: [] };
//     processChildren(children, id, props);
//     return props;
//   }, [hash({ children })]);

//   const document = useDocument(props);

//   useEffect(() => {
//     updateHead(document);
//   }, [hash(document.props)]);

//   return null;
// };

// export const Head: FC<PropsWithChildren<{}>> = ({ children }) => {
//   const renderHead = useHead();

//   if (!renderHead) {
//     return <HeadContent>{children}</HeadContent>;
//   }

//   const Head = useLazyComplete(
//     async () => () => {
//       const [, setState] = useState({});
//       const document = useDocument();

//       if (typeof window === 'undefined') {
//         useMemo(() => {
//           document.on('update', () => setState({}));
//         }, []);
//       } else {
//         useEffect(() => {
//           const handler = () => setState({});
//           document.on('update', handler);
//           return () => {
//             document.removeListener('update', handler);
//           };
//         }, []);
//       }

//       const html = renderToStaticMarkup(
//         <div data-pages-head>
//           <meta charSet="utf-8" />
//           {document.props.title && <title>{document.props.title}</title>}
//           {document.props.children}
//         </div>
//       );

//       console.info(html);

//       return <head dangerouslySetInnerHTML={{ __html: html }} />;
//     },
//     []
//   );

//   return <Head />;
// };
