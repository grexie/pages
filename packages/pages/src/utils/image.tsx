import React, { FC } from 'react';

export interface ImageProps {}

export const Image: FC<ImageProps & { src: string }> = ({ src }) => {
  return <img src={src} />;
};

export const wrapImage = (filename: string, extname: string) => {
  return (props: ImageProps) => <Image {...props} src={filename} />;
};
