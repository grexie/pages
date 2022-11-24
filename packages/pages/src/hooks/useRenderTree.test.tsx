import { act, renderHook } from '@testing-library/react-hooks';
import {
  RenderTreeNode,
  useRenderTreeNode,
  withRenderTree,
} from './useRenderTree.js';

describe('useRenderTree', () => {
  it('test', async () => {
    const { result } = renderHook(() => useRenderTreeNode());
    expect(result.current).toBeUndefined();
  });

  it('test2', async () => {
    const TreeNode = withRenderTree(({ children }) => <>{children}</>);

    const { result, rerender } = renderHook(() => useRenderTreeNode(), {
      wrapper: ({ mutate, children }) => {
        return (
          <TreeNode>
            <TreeNode />
            <TreeNode>
              {mutate >= 2 && (
                <TreeNode>
                  <TreeNode>
                    <TreeNode />
                  </TreeNode>
                </TreeNode>
              )}
              {mutate >= 1 && (
                <TreeNode>
                  <TreeNode />
                </TreeNode>
              )}
              <TreeNode>{children}</TreeNode>
            </TreeNode>
            <TreeNode />
          </TreeNode>
        );
      },
      initialProps: {
        mutate: 0,
      },
    });
    expect(result.current).toBeInstanceOf(RenderTreeNode);
    expect(result.current.root).toBeInstanceOf(RenderTreeNode);
    expect(result.current.root).not.toEqual(result.current);
    expect(result.current.root).toMatchSnapshot();
    act(() => {
      rerender({ mutate: 1 });
    });
    expect(result.current.root).toMatchSnapshot();
    act(() => {
      rerender({ mutate: 2 });
    });
    expect(result.current.root).toMatchSnapshot();
  });
});
