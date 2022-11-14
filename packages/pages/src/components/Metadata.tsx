import type { ReactNode, FC } from 'react';
import { useMetadata } from '../hooks/useResource.js';

export interface MetadataProps {
  resource?: boolean;
  field?: string;
  render: (value: any) => ReactNode;
}

export const Metadata: FC<MetadataProps> = ({
  resource = false,
  field,
  render,
}) => {
  const metadata = useMetadata({ resource });

  const path = field?.split(/(\.|\[)/g);
  let value = metadata;
  for (let component of path ?? []) {
    if (component.endsWith(']')) {
      value =
        value[
          JSON.parse(
            component.substring(0, component.length - 1).replace(/'/g, '"')
          )
        ];
    } else {
      value = value[component];
    }
  }

  value = render?.(value);

  return <>{value}</>;
};
