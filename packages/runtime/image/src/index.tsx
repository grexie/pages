import { FC, ComponentType } from 'react';
import type { Metadata } from 'sharp';
import styles from './index.global.css';

interface ImageSize {
  size?: number | string;
}
interface ImageWidth {
  width?: number | string;
}
interface ImageHeight {
  height?: number | string;
}
export type ImageDimensions = ImageSize & ImageWidth & ImageHeight;

export type ImageProps = {
  className: string;
} & ImageDimensions;

export type Image = FC<ImageProps>;

export const wrapImage = (filename: string, metadata: Metadata): Image => {
  return ({ width, height, size, className }: ImageProps) => {
    styles.use();

    return (
      <div
        className={styles('pages-image', className)}
        style={{
          maxWidth: width ?? size ?? metadata!.width,
          maxHeight: height ?? size ?? metadata!.height,
        }}
      >
        <span className={styles('pages-image-placeholder')} />
        <img className={styles('pages-image-img')} src={filename} />
      </div>
    );
  };
};

export const wrapImageComponent = (
  Component: ComponentType<ImageProps>,
  metadata: Metadata
): Image => {
  return ({ width, height, size, className }: ImageProps) => (
    <Component
      className={className}
      width={width ?? size ?? metadata.width}
      height={height ?? size ?? metadata.height}
    />
  );
};
