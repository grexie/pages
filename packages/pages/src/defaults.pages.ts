import type { ResourceMetadata } from './api/Resource';
import type { Config } from './builder/ConfigContext';

export const metadata = (): ResourceMetadata => ({});

export const config = (): Config => ({
  metadata,
});
