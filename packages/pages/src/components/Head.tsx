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
  if (!element) {
    return element;
  }

  const {
    children = [],
    dangerouslySetInnerHTML: { __html: html = undefined } = {},
    ...props
  } = element?.props ?? {};

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
    ].includes(element?.type as any)
  ) {
    return createElement(element?.type, {
      ...props,
    });
  } else if (['title'].includes(element?.type as any)) {
    return createElement(
      element.type,
      {
        ...props,
      },
      string
    );
  } else {
    return createElement(element?.type, {
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

  get next(): HeadContext | undefined {
    const next = this.#node.next;

    if (next) {
      return HeadContextNodeTable.get(next);
    }
  }

  get nodeOrder() {
    let stack = [this.root];
    let el: HeadContext | undefined;
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
        let immediate: NodeJS.Immediate;

        if ((window as any).__PAGES_HEAD__) {
          (window as any).__PAGES_HEAD__.render(this.render());
        } else {
          (window as any).__PAGES_HEAD__ = hydrateRoot(document.head, element);
        }

        this.on('update', () => {
          clearImmediate(immediate);
          immediate = setImmediate(() => {
            const element = this.render();
            (window as any).__PAGES_HEAD__.render(element);
          });
        });
      });
    }
  }

  #mutateCharacterData(mutation: MutationRecord) {
    if (!this.fragment) {
      return;
    }

    const source = mutation.target.parentElement!;
    const index = Array.from(this.fragment.childNodes).indexOf(source);

    const target = document.head.childNodes[
      this.nodeOrder + index
    ] as HTMLElement;

    target.innerHTML = source.innerHTML;
  }

  #mutateAttributes(mutation: MutationRecord) {
    const source = mutation.target as HTMLElement;
    const index = Array.from(source.parentNode!.childNodes).indexOf(source);
    const dest = document.head.childNodes.item(
      this.nodeOrder + index
    )! as HTMLElement;
    if (
      !source.hasAttributeNS(
        mutation.attributeNamespace,
        mutation.attributeName!
      )
    ) {
      dest.removeAttributeNS(
        mutation.attributeNamespace,
        mutation.attributeName!
      );
    } else {
      const value = source.getAttributeNS(
        mutation.attributeNamespace,
        mutation.attributeName!
      );
      dest.setAttributeNS(
        mutation.attributeNamespace,
        mutation.attributeName!,
        value!
      );
    }
  }

  #mutateChildList(mutation: MutationRecord) {
    const nodeOrder = this.nodeOrder;

    if (mutation.target !== this.fragment) {
      return;
    }

    const previousSiblingIndex = mutation.previousSibling
      ? Array.from(document.head.childNodes).findIndex(node =>
          node.isEqualNode(mutation.previousSibling)
        )
      : -1;

    for (let i = 0; i < mutation.removedNodes.length; i++) {
      document.head.childNodes[previousSiblingIndex + i + 1].remove();
    }

    const nextSibling = document.head.childNodes[previousSiblingIndex + 1];
    for (let i = 0; i < mutation.addedNodes.length; i++) {
      document.head.insertBefore(
        mutation.addedNodes.item(i)?.cloneNode(true)!,
        nextSibling
      );
    }
  }

  mutate(mutations: MutationRecord[]) {
    let source: HTMLElement;

    mutations.forEach(mutation => {
      switch (mutation.type) {
        case 'attributes':
          return this.#mutateAttributes(mutation);
        case 'characterData':
          return this.#mutateCharacterData(mutation);
        case 'childList':
          return this.#mutateChildList(mutation);
      }
    });
  }

  initialize() {
    if (!this.fragment) {
      return;
    }

    const nodeOrder = this.nodeOrder;

    for (
      let i = nodeOrder;
      i < nodeOrder + (this.fragment.childNodes.length ?? 0);
      i++
    ) {
      if (!document.head.childNodes[i]) {
        document.head.appendChild(
          this.fragment.childNodes[i - nodeOrder].cloneNode(true)
        );
      } else if (
        !document.head.childNodes[i].isEqualNode(
          this.fragment.childNodes[i - nodeOrder]
        )
      ) {
        document.head.replaceChild(
          this.fragment.childNodes[i - nodeOrder].cloneNode(true),
          document.head.childNodes[i]
        );
      }
    }
  }

  setProps(props: HeadProps, contexts: SharedContexts) {
    let children;
    try {
      const handleElement = (element: ReactElement, key?: number) => {
        if (isElement(element)) {
          return cloneElement(
            flattenElement(element, contexts),
            typeof key !== 'undefined' ? { key: `${key}` } : {}
          );
        } else {
          return element;
        }
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
    } catch (err) {
      console.error(err);
      throw err;
    }
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
} = createContext<HeadContext>('Pages.Head', Provider =>
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

export interface HeadProps extends PropsWithChildren {
  onRender?: () => void;
}

export const Head: FC<HeadProps> = ({ children, ...props }) => {
  if (typeof window === 'undefined') {
    return <ServerHead {...props}>{children}</ServerHead>;
  } else {
    return <BrowserHead {...props}>{children}</BrowserHead>;
  }
};

export const { with: withHeadRendering, use: useHeadRendering } =
  createContext<boolean>('Pages.HeadRendering', Provider => ({ children }) => (
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

const useHeadPortal = (node: ReactNode, onRender?: () => void) => {
  const [show, setShow] = useState(false);
  const head = _useHead();

  if (typeof window === 'undefined') {
    return null;
  }

  const fragment = useMemo(() => {
    const fragment = document.createDocumentFragment();
    // for (let i = 0; i < length; i++) {
    //   fragment.appendChild(nodes[i].cloneNode(true));
    // }
    head.fragment = fragment;
    return fragment;
  }, []);

  useEffect(() => {
    setShow(true);

    const observer = new MutationObserver(mutations => {
      head.mutate(mutations);
      onRender?.();
    });
    onRender?.();
    head.initialize();
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

const BrowserHead: FC<BrowserHeadProps> = withHead(({ children, onRender }) => {
  // const contexts = useSharedContexts();
  return useHeadPortal(children, onRender);
});
