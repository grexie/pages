import { useMetadata, useResource } from '@grexie/pages';
import { FC } from 'react';
import { useTest } from 'hooks/useTest';

const Test: FC<{}> = () => {
  const metadata = useResource();
  const test = useTest();

  return (
    <>
      <pre>TestContext: {JSON.stringify(test)}</pre>
      <pre>{JSON.stringify(metadata, null, 2)}</pre>
      <div>Hello World</div>
    </>
  );
};

export default Test;

export const metadata = {
  title: 'Test Page',
};
