import { useMetadata, useResource } from '@grexie/pages';
import { FC } from 'react';

const Test: FC<{}> = () => {
  const metadata = useResource();
  return (
    <>
      <pre>{JSON.stringify(metadata, null, 2)}</pre>
      <div>Hello World</div>
    </>
  );
};

export default Test;

export const metadata = {
  title: 'Test Page',
};
