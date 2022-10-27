import React, { FC } from 'react';
import type { Metadata } from 'sharp';
import styles from './image.global.css';
export interface ImageProps {
  size?: number | string;
}

export const Image: FC<ImageProps & { src: string; metadata: Metadata }> = ({
  src,
  size,
  metadata,
}) => {
  styles.use();

  return (
    <div
      className={styles('pages-image')}
      style={{ maxWidth: size ?? metadata.width }}
    >
      <span className={styles('pages-image-placeholder')} />
      <img className={styles('pages-image-img')} src={src} />
    </div>
  );
};

export const wrapImage = (filename: string, metadata: Metadata) => {
  return (props: ImageProps) => (
    <Image {...props} src={filename} metadata={metadata} />
  );
};
