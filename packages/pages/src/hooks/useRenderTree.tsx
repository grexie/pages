import { createContext } from '@grexie/context';
import { useEffect, useMemo } from 'react';

export class RenderTreeNode {
  readonly parent?: RenderTreeNode;
  readonly children: RenderTreeNode[] = [];

  get index() {
    return this.parent?.children.indexOf(this) ?? 0;
  }

  get order() {
    let stack = [this.root];
    let el: RenderTreeNode;
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

  constructor(parent?: RenderTreeNode) {
    this.parent = parent;
    this.parent?.children.push(this);
  }

  get root() {
    let el = this;
    while (el.parent) {
      el = el.parent;
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

export const {
  Provider: RenderTreeProvider,
  use: useRenderTreeNode,
  with: withRenderTree,
} = createContext<RenderNode>(Provider => ({ children }) => {
  const parentNode = useRenderTreeNode();
  const context = useMemo(() => new RenderTreeNode(parentNode), []);
  useEffect(() => {
    const index = context.parent?.children.indexOf(context) ?? -1;
    if (index !== -1) {
      context.parent?.children.splice(index, 1);
    }
    context.parent?.children.push(context);

    return () => {
      const index = context.parent?.children.indexOf(context) ?? -1;
      if (index !== -1) {
        context.parent?.children.splice(index, 1);
      }
    };
  });
  return <Provider value={context}>{children}</Provider>;
});
