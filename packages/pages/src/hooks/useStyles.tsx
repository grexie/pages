import { EventEmitter } from 'events';
import React, { useEffect, useMemo, useState } from 'react';
import { createContextWithProps } from '../utils/context';

export interface StylesProviderProps {
  styles: StylesContext;
}

export class StylesContext extends EventEmitter {
  #styles = new Set<{ css: string }>();

  add(css: string) {
    const entry = { css } as { css: string };
    this.#styles.add(entry);
    this.emit('update');
    return () => {
      this.#styles.delete(entry);
      this.emit('update');
    };
  }

  [Symbol.iterator](): Iterator<string> {
    return [...new Set<string>([...this.#styles].map(({ css }) => css))][
      Symbol.iterator
    ]();
  }
}

export const { with: withStyles, use: _useStyles } = createContextWithProps<
  StylesContext,
  StylesProviderProps
>(Provider => ({ styles, children }) => (
  <Provider value={styles}>{children}</Provider>
));

export const useStyles = () => {
  const [, setState] = useState({});
  const styles = _useStyles();

  useMemo(() => {
    styles.on('update', () => setState({}));
  }, []);

  return styles;
};
