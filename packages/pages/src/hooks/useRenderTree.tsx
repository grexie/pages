import { createContext } from '@grexie/context';
import { useEffect, useLayoutEffect, useMemo } from 'react';

export class RenderTreeNode {
  readonly parent?: RenderTreeNode;
  readonly children: RenderTreeNode[] = [];
  previous?: RenderTreeNode;

  get index() {
    return this.parent?.children.indexOf(this) ?? 0;
  }

  get order() {
    let stack: RenderTreeNode[] = [this.root];
    let el: RenderTreeNode | undefined;
    let order = 0;
    while ((el = stack.shift())) {
      if (el === this) {
        break;
      }
      stack.unshift(...el.children);
      order++;
    }
    return order;
  }

  get next(): RenderTreeNode | undefined {
    let index = this.index;
    let seen = new Set<RenderTreeNode>([this]);
    let stack: RenderTreeNode[] = [this];
    let el: RenderTreeNode | undefined;
    while ((el = stack.shift())) {
      if (el.index === index + 1) {
        return el;
      }
      if (seen.has(el)) {
        continue;
      }
      seen.add(el);
      stack.push(...this.children);
      if (this.parent) {
        stack.push(this.parent);
      }
    }
    return;
  }

  constructor(parent?: RenderTreeNode) {
    this.parent = parent;
    this.parent?.children.push(this);
  }

  get root() {
    let el: RenderTreeNode = this;
    while (el.parent) {
      el = el.parent!;
    }
    return el;
  }

  toJSON() {
    return {
      index: this.index,
      order: this.order,
      children: this.children,
    };
  }
}

const _useLayoutEffect =
  typeof window === 'undefined' || process.env.NODE_ENV === 'test'
    ? useEffect
    : useLayoutEffect;

export const {
  Provider: RenderTreeProvider,
  use: useRenderTreeNode,
  with: withRenderTree,
} = createContext<RenderTreeNode>(
  'Pages.RenderTree',
  Provider =>
    ({ children }) => {
      const parentNode = useRenderTreeNode();
      const context = useMemo(() => new RenderTreeNode(parentNode), []);
      _useLayoutEffect(() => {
        const remove = () => {
          const index = context.parent?.children.indexOf(context) ?? -1;
          if (index !== -1) {
            context.parent?.children.splice(index, 1);
          }
          return index;
        };

        let index = remove();
        if (context.parent) {
          if (index === -1) {
            index = (context.parent.previous?.index ?? -1) + 1;
          }
        }
        if (index === -1) {
          context.parent?.children.push(context);
        } else {
          context.parent?.children.splice(index, 0, context);
        }
        if (context.parent) {
          context.parent.previous = context;
        }

        return () => {
          remove();
        };
      });

      useEffect(() => {
        if (context.parent) {
          delete context.parent.previous;
        }
      });
      return <Provider value={context}>{children}</Provider>;
    }
);
