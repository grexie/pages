import { FC } from 'react';
import styles from './index.module.scss';
import Logo from './grexie-pages-logo.svg';
import { pages } from '@grexie/pages';

interface HeaderProps {
  className?: string;
}

export const Header: FC<HeaderProps> = ({ className }) => {
  styles.use();

  const {
    page: { head },
  }: any = pages`
    query {
      page {
        head {
          title
        }
      }
    }
  `;

  return (
    <div className={styles('container', className)}>
      <Logo width={40} className={styles('logo')} />
      <h1>{head.title}</h1>
    </div>
  );
};

export const metadata = {
  page: {
    transform: true,
  },
};
