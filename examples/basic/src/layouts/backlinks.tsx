import { FC } from 'react';
import { pages as gql, Link } from '@grexie/pages';
import { Category } from '../../.pages';
import { useRouter } from 'next/router';

interface CategoriesQuery {
  page: {
    categories: Category[];
  };
}

const Backlinks: FC<{}> = () => {
  let {
    page: { categories },
  } = gql<CategoriesQuery>`
    {
      page {
        categories
      }
    }
  `;

  const router = useRouter();

  categories = categories.map(category => new Category(category));

  return (
    <>
      {categories.map(category => (
        <Link key={category.id} href={router.basePath + category.slug}>
          {category.name}
        </Link>
      ))}
    </>
  );
};

export default Backlinks;

export const metadata = {};
