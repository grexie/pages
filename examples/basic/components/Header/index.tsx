import { FC } from "react";
import styles from "./index.module.scss";

interface HeaderProps {
  className?: string;
}

export default () => null;

export const Header: FC<HeaderProps> = ({ className }) => {
  styles.use();

  return <div className={styles("container", className)}>Header</div>;
};
