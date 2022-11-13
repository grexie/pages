import {
  ReactNode,
  ReactElement,
  FC,
  PropsWithChildren,
  useMemo,
  cloneElement,
} from 'react';
import { isElement, isFragment } from 'react-is';
import { hash } from '../utils/hash.js';
import { createContext } from '../utils/context.js';

class HeadContext {
  readonly parent?: HeadContext;
  props: HeadProps = {};
  children: HeadContext[] = [];

  constructor(parent?: HeadContext) {
    this.parent = parent;
    parent?.children.push(this);
  }

  setProps(props: { children?: ReactNode }) {
    let fragment;

    if (Array.isArray(props.children)) {
      fragment = <>{props.children.map(child => cloneElement(child))}</>;
    } else if (isFragment(props.children)) {
      fragment = <>{cloneElement(props.children.props.children)}</>;
    } else if (isElement(props.children)) {
      fragment = <>{cloneElement(props.children)}</>;
    } else {
      fragment = <>{props.children}</>;
    }

    this.props = { children: fragment };
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
        {this.props.children}
        {this.children.map(child => child.render())}
      </>
    );
  }
}

export const {
  Provider: HeadProvider,
  use: useHead,
  with: withHead,
} = createContext<HeadContext>(Provider => ({ children }) => {
  const parentContext = useHead();
  const context = useMemo(() => new HeadContext(parentContext), []);
  return <Provider value={context}>{children}</Provider>;
});

export interface HeadProps extends PropsWithChildren<{}> {}

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
  const head = useHead();

  useMemo(() => {
    head.setProps(props);
  }, [hash(props)]);

  return null;
});

interface BrowserHeadProps extends HeadProps {}

const BrowserHead: FC<BrowserHeadProps> = withHead(({ ...props }) => {
  const head = useHead();

  useMemo(() => {
    head.setProps(props);
    console.info(head);
  }, [hash(props)]);

  return null;
});

// const nodeToString = (children: ReactNode) => {
//   const out: string[] = [];

//   Children.toArray(children).forEach(child => {
//     if (typeof child === 'boolean') {
//       return;
//     } else if (typeof child === 'string' || typeof child === 'number') {
//       out.push(child.toString());
//       return;
//     } else if (Array.isArray(child)) {
//       out.push(nodeToString(child));
//       return;
//     } else if (typeof child === 'object' && child !== null) {
//       if ((child as any).type === Fragment) {
//         out.push(nodeToString((child as any).props.children));
//         return;
//       }
//     }

//     throw new Error('children must be fragments, strings or numbers');
//   });

//   return out.join('');
// };

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
