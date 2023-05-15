import { useEffect, useMemo, useState } from 'react';
import { useStyles, useFirstRender } from '@grexie/pages';
export class StyleSheet {
  constructor(hash, css, locals, variables) {
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
      const [_loading, setLoading] = useState(() => !isFirstRender && !styles.hasRendered(this.hash));
      loading = _loading;
      useEffect(() => {
        return styles.add(this.hash, this.css, () => {
          setLoading(() => false);
        });
      }, []);
    }
    return loading;
  }
  resolve(cls) {
    if (this.locals[cls]) {
      return this.locals[cls];
    } else {
      return cls;
    }
  }
  classes(...classList) {
    const out = new Set();
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
  var(name) {
    return this.variables[name];
  }
}
export const wrapStyles = (hash, css, locals = {}, variables = {}) => {
  const styles = new StyleSheet(hash, css, locals, variables);
  const out = styles.classes.bind(styles);
  out.use = styles.use.bind(styles);
  out.resolve = styles.resolve.bind(styles);
  out.var = styles.var.bind(styles);
  out.styleSheet = styles;
  return out;
};
//# sourceMappingURL=index.js.map