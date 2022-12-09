import babel, { PluginObj, PluginPass } from '@babel/core';

interface SSRBabelPluginOptions {
  context: BuildContext;
}

export const SSRBabelPlugin =
  (
    options: SSRBabelPluginOptions
  ): ((b: typeof babel) => PluginObj<PluginPass>) =>
  () => ({
    visitor: {
      Program(path) {
        path.traverse({
          enter(path) {
            const comments = path.node.leadingComments?.filter(
              comment =>
                comment.type === 'CommentBlock' &&
                /^\*\s*@server\s*$/.test(comment.value),
              false
            );
            if (comments?.length) {
              for (const comment of comments) {
                path.node.leadingComments = [];
              }
              path.remove();
            }
          },
        });
      },
    },
  });
