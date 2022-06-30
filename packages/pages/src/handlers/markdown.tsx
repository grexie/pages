import React, { FC, PropsWithChildren } from 'react';
import { compile } from '@mdx-js/mdx';
import grayMatter from 'gray-matter';
import { useModule } from '../hooks';
import { Resource } from '../api';
import { SourceContext } from '../builder/SourceContext';

const Markdown: FC<PropsWithChildren<{}>> = ({ children }) => {
  const { default: Component } = useModule({ resource: true });
  return <Component components={{ Block: () => <>{children}</> }} />;
};

export default Markdown;

export const resource = async (
  context: SourceContext
): Promise<Resource<any>> => {
  const { content, data: metadata } = grayMatter(context.content.toString());
  Object.assign(context.metadata, metadata);

  const source = await compile(content, {
    outputFormat: 'program',
  });

  return context.createModule({
    source: source.toString(),
  });
};
