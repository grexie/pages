declare module '*.svg' {
  import type { Image } from '@grexie/pages-runtime-image';
  const Component: Image;
  export default Component;
}

declare module '*.png' {
  import type { Image } from '@grexie/pages-runtime-image';
  const Component: Image;
  export default Component;
}

declare module '*.gif' {
  import type { Image } from '@grexie/pages-runtime-image';
  const Component: Image;
  export default Component;
}

declare module '*.jpe?g' {
  import type { Image } from '@grexie/pages-runtime-image';
  const Component: Image;
  export default Component;
}

declare module '*.webp' {
  import type { Image } from '@grexie/pages-runtime-image';
  const Component: Image;
  export default Component;
}
