import EventEmitter from 'events';
import React, { useMemo, useState } from 'react';
import { createContextWithProps } from '../utils/context';

export interface StylesProviderProps {
  styles: StylesContext;
}

export class StylesContext extends EventEmitter {
  #styles = new Set<{ hash: string; css: string }>();

  add(hash: string, css: string) {
    const entry = { hash, css } as { hash: string; css: string };
    this.#styles.add(entry);
    this.emit('update');
    return () => {
      this.#styles.delete(entry);
      this.emit('update');
    };
  }

  [Symbol.iterator](): Iterator<{ hash: string; css: string }> {
    const stylesMap = [...this.#styles].reduce((a, { hash, css }) => {
      if (hash in a) {
        return a;
      } else {
        return { ...a, [hash]: css };
      }
    }, {}) as Record<string, string>;
    const styles = Object.keys(stylesMap).map(hash => ({
      hash,
      css: stylesMap[hash],
    }));
    return styles[Symbol.iterator]();
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

export const Styles = () => {
  const styles = useStyles();

  return (
    <>
      {[...styles].map(({ hash, css }) => (
        <style key={hash} dangerouslySetInnerHTML={{ __html: css }} />
      ))}
    </>
  );
};
