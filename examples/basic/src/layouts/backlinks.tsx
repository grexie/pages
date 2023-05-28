import { FC } from 'react';
import { pages as gql, Link } from '@grexie/pages';
import { Category } from '../../.pages';

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

  categories = categories.map(category => new Category(category));

  return (
    <>
      {categories.map(category => (
        <Link key={category.id} href={category.slug}>
          {category.name}
        </Link>
      ))}
    </>
  );
};

export default Backlinks;

export const metadata = {};
