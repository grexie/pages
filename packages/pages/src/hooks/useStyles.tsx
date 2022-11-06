import EventEmitter from 'events';
import { useEffect, useMemo, useState, startTransition, FC } from 'react';
import { createContextWithProps } from '../utils/context.js';
import hash from 'object-hash';
import { setImmediate, clearImmediate } from 'timers';
import { Head } from '../components/Head.js';

export interface StylesProviderProps {
  styles: StylesContext;
}

export class StylesContext extends EventEmitter {
  #updateTimeout?: NodeJS.Immediate;
  #styles = new Map<string, { hash: string; css: string }>();

  constructor(styles?: { hash: string; css: string }[]) {
    super();
    if (styles) {
      for (const style of styles) {
        this.#styles.set(style.hash, style);
      }
    }
  }

  #emitUpdate() {
    clearImmediate(this.#updateTimeout);
    this.#updateTimeout = setImmediate(() => {
      startTransition(() => {
        this.emit('update');
      });
    });
  }

  add(hash: string, css: string) {
    const entry = { hash, css } as { hash: string; css: string };
    this.#styles.set(hash, entry);
    this.#emitUpdate();

    return () => {
      this.#styles.delete(hash);
      this.#emitUpdate();
    };
  }

  [Symbol.iterator](): Iterator<{ hash: string; css: string }> {
    const stylesMap = [...this.#styles].reduce((a, [, { hash, css }]) => {
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

const { with: withStyles, use: _useStyles } = createContextWithProps<
  StylesContext,
  StylesProviderProps
>(Provider => ({ styles, children }) => {
  const _styles = useMemo(
    () => styles,
    [hash(styles, { ignoreUnknown: true })]
  );
  return <Provider value={_styles}>{children}</Provider>;
});

export { withStyles };

export const useStyles = () => {
  const [, setState] = useState({});
  const styles = _useStyles();

  if (typeof window === 'undefined') {
    useMemo(() => {
      styles.on('update', () => setState({}));
    }, []);
  } else {
    useEffect(() => {
      const handler = () => setState({});
      styles.on('update', handler);
      return () => {
        styles.removeListener('update', handler);
      };
    }, []);
  }

  return styles;
};

export const Styles: FC<{}> = () => {
  const styles = useStyles();

  console.info('rendering styles');
  return (
    <Head>
      {[...styles].map(({ hash, css }) => (
        <style key={hash} dangerouslySetInnerHTML={{ __html: css }} />
      ))}
    </Head>
  );
};
