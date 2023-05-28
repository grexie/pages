import { useResource, pages } from '@grexie/pages';
import { FC } from 'react';
import { useTest } from 'hooks/useTest';

export enum PageType {
  post = 'post',
  page = 'page',
  import = 'import',
  category = 'category',
}

export interface PageQuery {
  categories: string[];
  page: {
    type: PageType;
    path: string[];
    slug: string;
    title: string;
    date: Date;
    categories: string[];
    head: {
      title: string;
    };
  };
}

const Test: FC<{}> = () => {
  const metadata = useResource();
  const test = useTest();

  const data = pages<PageQuery>`
    query {
      categories

      pages(filter: { type: { in: [post] } }, limit: 4) {
        resources {
          path
          slug
          type
          title
          date
          categories
        }
        count
      }

      page {
        type
        path
        slug
        title
        date
        categories

        head {
          title
        }
      }
    }
  `;

  return (
    <>
      <pre>{JSON.stringify(data, null, 2)}</pre>
      <pre>TestContext: {JSON.stringify(test)}</pre>
      <pre>{JSON.stringify(metadata, null, 2)}</pre>
      <div>Hello World</div>
    </>
  );
};

export default Test;

export const metadata = {
  type: 'category',
  title: 'Test Page',
  date: '2023-05-21T02:58:00+01:00',
  categories: ['blog'],
};
