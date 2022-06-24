import React, { FC, PropsWithChildren } from 'react';
import { compile } from '@mdx-js/mdx';
import grayMatter from 'gray-matter';
import { useModule } from '../hooks';
import { Resource } from '../api';
import { SourceContext } from '../builder/SourceContext';

const Markdown: FC<PropsWithChildren<{}>> = ({ children }) => {
  const { default: Component } = useModule({ resource: true });
  return <Component components={{ Children: () => <>{children}</> }} />;
};

export default Markdown;

export const resource = async (
  context: SourceContext
): Promise<Resource<any>> => {
  const { content, data: metadata } = grayMatter(context.content.toString());

  const code = await compile(content, {
    outputFormat: 'program',
  });

  return context.createModule({
    code: code.toString(),
    metadata,
  });
};
