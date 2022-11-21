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

type ImageComponentProps = {
  src: string;
  metadata: Metadata;
} & ImageProps &
  Partial<ImageDimensions>;

export const Image: FC<ImageComponentProps> = ({
  src,
  size,
  metadata,
  className,
}: Partial<ImageComponentProps>) => {
  styles.use();

  return (
    <div
      className={styles('pages-image', className)}
      style={{ maxWidth: size ?? metadata!.width }}
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

export const wrapImageComponent = (
  Component: ComponentType<ImageProps>,
  metadata: Metadata
) => {
  return ({ width, height, size, className }: ImageProps) => (
    <Component
      className={className}
      width={width ?? size}
      height={height ?? size}
    />
  );
};
