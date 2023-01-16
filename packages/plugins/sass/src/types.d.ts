declare module '*.scss' {
  import type { StyleFunction } from '@grexie/pages-runtime-styles';
  const styles: StyleFunction;
  export default styles;
}

declare module '*.sass' {
  import type { StyleFunction } from '@grexie/pages-runtime-styles';
  const styles: StyleFunction;
  export default styles;
}
