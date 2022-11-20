import { FC } from 'react';
import styles from './index.module.scss';
import Logo from '../../../../images/grexie-pages-logo.svg';

interface HeaderProps {
  className?: string;
}

export default () => null;

export const Header: FC<HeaderProps> = ({ className }) => {
  styles.use();

  return (
    <div className={styles('container', className)}>
      <Logo size={40} className={styles('logo')} />
      <h1>My Site</h1>
    </div>
  );
};
