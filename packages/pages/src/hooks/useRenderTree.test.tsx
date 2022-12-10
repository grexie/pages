import { act, renderHook } from '@testing-library/react';
import {
  createContext,
  Dispatch,
  PropsWithChildren,
  SetStateAction,
  useContext,
  useLayoutEffect,
  useState,
} from 'react';
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
    const MutateContext = createContext<Dispatch<SetStateAction<number>>>(
      null as any
    );

    const TreeNode = withRenderTree(({ children }: PropsWithChildren) => (
      <>{children}</>
    ));

    const { result, rerender } = renderHook(
      ({ mutate }: { mutate: number }) => {
        const setMutate = useContext(MutateContext);
        useLayoutEffect(() => {
          setMutate(mutate);
        }, [mutate]);
        return useRenderTreeNode();
      },
      {
        wrapper: ({ children }) => {
          const [mutate, setMutate] = useState(0);

          return (
            <MutateContext.Provider value={setMutate}>
              <TreeNode>
                <TreeNode />
                <TreeNode>
                  <TreeNode />
                  <TreeNode />
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
            </MutateContext.Provider>
          );
        },
        initialProps: {
          mutate: 0,
        },
      }
    );
    expect(result.current).toBeInstanceOf(RenderTreeNode);
    expect(result.current.root).toBeInstanceOf(RenderTreeNode);
    expect(result.current.root).not.toEqual(result.current);
    expect(result.current.root).toMatchSnapshot('mutate-0');
    act(() => {
      rerender({ mutate: 1 });
    });
    expect(result.current.root).toMatchSnapshot('mutate-1');
    act(() => {
      rerender({ mutate: 2 });
    });
    expect(result.current.root).toMatchSnapshot('mutate-2');
    act(() => {
      rerender({ mutate: 1 });
    });
    expect(result.current.root).toMatchSnapshot('mutate-1');
    act(() => {
      rerender({ mutate: 2 });
    });
    expect(result.current.root).toMatchSnapshot('mutate-2');
  });
});
