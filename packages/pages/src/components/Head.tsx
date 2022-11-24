import React, {
  ReactElement,
  FC,
  PropsWithChildren,
  useMemo,
  cloneElement,
  useState,
  useEffect,
  startTransition,
  Children,
  createElement,
  ReactNode,
} from 'react';
import EventEmitter from 'events';
import { isElement, isFragment } from 'react-is';
import { hash } from '@grexie/hash-object';
import {
  createContext,
  SharedContextClone,
  useSharedContexts,
  type SharedContexts,
} from '@grexie/context';
import {
  RenderTreeNode,
  useRenderTreeNode,
  withRenderTree,
} from '../hooks/useRenderTree.js';
import { setImmediate } from 'timers';
import { hydrateRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { createPortal, unmountComponentAtNode } from 'react-dom';

const flattenElement = (element: ReactElement, contexts: SharedContexts) => {
  const {
    children,
    dangerouslySetInnerHTML: { __html: html = undefined } = {},
    ...props
  } = element.props;

  const Component = () => (
    <SharedContextClone contexts={contexts}>{children}</SharedContextClone>
  );

  const string = html ?? renderToStaticMarkup(<Component />);

  if (
    [
      'area',
      'base',
      'br',
      'col',
      'embed',
      'hr',
      'img',
      'keygen',
      'link',
      'meta',
      'param',
      'source',
      'track',
      'wbr',
    ].includes(element.type as any)
  ) {
    return createElement(element.type, {
      ...props,
    });
  } else if (['title'].includes(element.type as any)) {
    return createElement(
      element.type,
      {
        ...props,
      },
      string
    );
  } else {
    return createElement(element.type, {
      ...props,
      dangerouslySetInnerHTML: { __html: string },
    });
  }
};

const HeadContextNodeTable = new WeakMap<RenderTreeNode, HeadContext>();

class HeadContext extends EventEmitter {
  readonly #node: RenderTreeNode;
  fragment?: DocumentFragment;
  props: HeadProps = {};

  get root() {
    return HeadContextNodeTable.get(this.#node.root)!;
  }

  get parent() {
    return this.#node.parent && HeadContextNodeTable.get(this.#node.parent);
  }

  get index() {
    return this.#node.index;
  }

  get order() {
    return this.#node.order;
  }

  get children() {
    return this.#node.children.map(node => HeadContextNodeTable.get(node)!);
  }

  get nodeOrder() {
    let stack = [this.root];
    let el: HeadContext;
    let order = 0;
    while ((el = stack.shift())) {
      if (el === this) {
        break;
      }
      stack.unshift(...el.children);
      order += el.fragment?.childNodes.length ?? 0;
    }
    return order;
  }

  constructor(node: RenderTreeNode) {
    super();

    this.#node = node;
    HeadContextNodeTable.set(node, this);

    if (typeof window !== 'undefined' && !parent) {
      setImmediate(() => {
        const element = this.render();
        let immediate;

        if ((window as any).__PAGES_HEAD__) {
          (window as any).__PAGES_HEAD__.render(this.render());
        } else {
          (window as any).__PAGES_HEAD__ = hydrateRoot(document.head, element);
        }

        this.on('update', () => {
          clearImmediate(immediate);
          immediate = setImmediate(() => {
            console.time('rendering');
            const element = this.render();
            console.timeEnd('rendering');
            console.time('sending to head');
            (window as any).__PAGES_HEAD__.render(element);
            console.timeEnd('sending to head');
          });
        });
      });
    }
  }

  print() {
    let stack = [this];
    let el: HeadContext;
    let out = [];
    while ((el = stack.shift())) {
      stack.unshift(...el.children);
      console.info(el.nodeOrder, el.fragment);
    }
    return out;
  }

  mutate(mutation: MutationRecord) {
    let source: HTMLElement;

    console.info('---');
    this.root.print();

    if (mutation.target.nodeType === Node.TEXT_NODE) {
      source = mutation.target.parentElement;
    } else if (mutation.target.nodeType === Node.ELEMENT_NODE) {
      source = mutation.target;
    }

    if (!source) {
      return;
    }

    const target =
      document.head.childNodes[
        this.nodeOrder +
          Array.from(source.parentNode.childNodes).indexOf(source)
      ];

    console.info(source, target);
    target.replaceWith(source.cloneNode(true));
  }

  setProps(props: HeadProps, contexts: SharedContexts) {
    console.time('set props');
    let children;

    const handleElement = (element: ReactElement, key?: number) => {
      return cloneElement(
        flattenElement(element, contexts),
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

    this.root.emit('update');

    console.timeEnd('set props');
  }

  render(): ReactElement {
    return (
      <>
        {this.props.children}
        {this.children.map((child, i) => {
          const Child = () => child.render();
          return <Child key={`${i}`} />;
        })}
      </>
    );
  }
}

export const {
  Provider: HeadProvider,
  use: _useHead,
  with: withHead,
} = createContext<HeadContext>(Provider =>
  withRenderTree(({ children }) => {
    const node = useRenderTreeNode();
    const parentContext = _useHead();
    const context = useMemo(() => new HeadContext(node), []);
    return <Provider value={context}>{children}</Provider>;
  })
);

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
          setState({});
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

export interface HeadProps extends PropsWithChildren {}

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

const ServerHead: FC<ServerHeadProps> = withHead(({ children }) => {
  const head = _useHead();
  const contexts = useSharedContexts();

  useMemo(() => {
    head.setProps({ children }, contexts);
  }, [hash(children), contexts]);

  return null;
});

interface BrowserHeadProps extends HeadProps {}

const useHeadPortal = (node: ReactNode) => {
  const [show, setShow] = useState(false);
  const head = _useHead();

  if (typeof window === 'undefined') {
    return null;
  }

  const fragment = useMemo(() => {
    const fragment = document.createDocumentFragment();
    head.fragment = fragment;
    return fragment;
  }, []);

  useEffect(() => {
    setShow(true);

    const observer = new MutationObserver(mutations => {
      mutations.forEach(mutation => head.mutate(mutation));
    });
    observer.observe(fragment, {
      childList: true,
      subtree: true,
      characterData: true,
      attributeOldValue: true,
      attributes: true,
    });

    return () => {
      observer.disconnect();
      unmountComponentAtNode(fragment);
    };
  }, []);

  return show ? createPortal(node, fragment) : null;
};

const BrowserHead: FC<BrowserHeadProps> = withHead(({ children }) => {
  // const contexts = useSharedContexts();
  return useHeadPortal(children);
});
