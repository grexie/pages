import { act, renderHook } from '@testing-library/react';
import {
  createContext,
  Dispatch,
  PropsWithChildren,
  SetStateAction,
  useContext,
  useLayoutEffect,
  useState,
  FC,
} from 'react';
import {
  RenderTreeNode,
  useRenderTreeNode,
  withRenderTree,
} from './useRenderTree.js';
import { expect } from 'chai';
import * as chai from 'chai';
import { jestSnapshotPlugin } from 'mocha-chai-jest-snapshot';

chai.use(jestSnapshotPlugin());

describe('Grexie Pages', () => {
  describe('useRenderTree', () => {
    it('test', async () => {
      const { result } = renderHook(() => useRenderTreeNode());
      expect(result.current).to.be.undefined;
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
          wrapper: (({ children }) => {
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
          }) as FC<PropsWithChildren>,
          initialProps: {
            mutate: 0,
          },
        }
      );
      expect(result.current).instanceOf(RenderTreeNode);
      expect(result.current.root).instanceOf(RenderTreeNode);
      expect(result.current.root).not.equal(result.current);
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
});
