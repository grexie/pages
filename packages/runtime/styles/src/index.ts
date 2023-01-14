import { useEffect, useMemo, useState } from 'react';
import { useStyles, useFirstRender } from '@grexie/pages';

export type Class = string | Record<string, any> | null | undefined;
export type StyleUnuseFunction = () => void;
export type StyleUseFunction = () => boolean;
export type StyleFunction = ((...classList: Class[]) => string) & {
  hash: string;
  css: string;
  use: StyleUseFunction;
  resolve: (cls: string) => string;
  var: (name: string) => string;
  styleSheet: StyleSheet;
};

export class StyleSheet {
  readonly hash: string;
  readonly css: string;
  readonly locals: Record<string, string>;
  readonly variables: Record<string, string>;

  constructor(
    hash: string,
    css: string,
    locals: Record<string, string>,
    variables: Record<string, string>
  ) {
    this.hash = hash;
    this.css = css;
    this.locals = locals;
    this.variables = variables;
  }

  use() {
    const isFirstRender = useFirstRender();
    const styles = useStyles();

    let loading;

    if (typeof window === 'undefined') {
      loading = useMemo(() => {
        styles.add(this.hash, this.css, () => {});
        return false;
      }, []);
    } else {
      const [_loading, setLoading] = useState(
        () => !isFirstRender && !styles.hasRendered(this.hash)
      );
      loading = _loading;
      useEffect(() => {
        return styles.add(this.hash, this.css, () => {
          setLoading(() => false);
        });
      }, []);
    }

    return loading;
  }

  resolve(cls: string) {
    if (this.locals[cls]) {
      return this.locals[cls];
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

  var(name: string) {
    return this.variables[name];
  }
}

export const wrapStyles = (
  hash: string,
  css: string,
  locals: Record<string, string> = {},
  variables: Record<string, string> = {}
) => {
  const styles = new StyleSheet(hash, css, locals, variables);

  const out = styles.classes.bind(styles) as StyleFunction;
  out.use = styles.use.bind(styles);
  out.resolve = styles.resolve.bind(styles);
  out.var = styles.var.bind(styles);
  out.styleSheet = styles;

  return out;
};
