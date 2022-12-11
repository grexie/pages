import type { ReactNode, FC } from 'react';
import { useConfig } from '../hooks/useResource.js';

export interface RenderConfigProps {
  resource?: boolean;
  field?: string;
  render: (value: any) => ReactNode;
}

export const RenderConfig: FC<RenderConfigProps> = ({
  resource = false,
  field,
  render,
}) => {
  const config = useConfig({ resource });

  const path = field?.split(/(\.|\[)/g);
  let value = config;
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
