import { useEffect, useMemo } from 'react';
import { useStyles } from '../hooks/useStyles';

export type Class = string | Record<string, any> | null | undefined;

export class StyleSheet {
  #css: string;
  #locals: Record<string, string>;

  constructor(css: string, locals: Record<string, string>) {
    this.#css = css;
    this.#locals = locals;
  }

  use() {
    const styles = useStyles();

    return useMemo(() => {
      return styles.add(this.#css);
    }, []);
  }

  resolve(cls: string) {
    if (this.#locals[cls]) {
      return this.#locals[cls];
    } else {
      return cls;
    }
  }

  classes(...classList: Class[]) {
    const out = new Set<string>();

    for (const cls of classList) {
      if (typeof cls === 'string') {
        out.add(this.resolve(cls));
      }
      if (typeof cls === 'object') {
        for (const k in cls) {
          if (!!cls[k]) {
            out.add(this.resolve(k));
          }
        }
      }
    }

    return [...out].join(' ');
  }
}

export const wrapStyles = (css: string, locals: Record<string, string>) =>
  new StyleSheet(css, locals);
