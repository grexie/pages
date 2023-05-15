import { FC } from "react";
import styles from "./index.module.scss";

interface FooterProps {
  className?: string;
}

export default () => null;

export const Footer: FC<FooterProps> = ({ className }) => {
  styles.use();

  return <div className={styles("container", className)}>Footer</div>;
};
