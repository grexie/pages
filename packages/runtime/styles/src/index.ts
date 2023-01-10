import { useEffect, useMemo } from 'react';
import { useStyles } from '@grexie/pages';

export type Class = string | Record<string, any> | null | undefined;
export type StyleUnuseFunction = () => void;
export type StyleUseFunction = () => StyleUnuseFunction;
export type StyleFunction = ((...classList: Class[]) => string) & {
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
    const styles = useStyles();

    const result = useMemo(() => {
      return styles.add(this.hash, this.css);
    }, []);

    // if (typeof window !== 'undefined') {
    //   useEffect(() => {
    //     return () => {
    //       result();
    //     };
    //   }, []);
    // }

    return result;
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
