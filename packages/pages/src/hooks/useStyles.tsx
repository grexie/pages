import EventEmitter from 'events';
import { useEffect, useMemo, useState, FC } from 'react';
import Head from 'next/head.js';
import { createContextWithProps } from '@grexie/context';
import { hash } from '@grexie/hash-object';
import { setImmediate, clearImmediate } from 'timers';

export interface StylesProviderProps {
  styles: StylesContext;
}

interface CSSEntry {
  hash: string;
  css: string;
  listeners: (() => void)[];
  rendered: boolean;
}

export class StylesContext extends EventEmitter {
  #updateTimeout?: NodeJS.Immediate;
  #styles = new Map<string, CSSEntry>();

  constructor(styles?: CSSEntry[]) {
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
      // startTransition(() => {
      this.emit('update');
      // });
    });
  }

  hasRendered(hash: string) {
    return this.#styles.get(hash)?.rendered ?? false;
  }

  add(hash: string, css: string, listener: () => void) {
    let entry: CSSEntry = {
      hash,
      css,
      listeners: [
        () => {
          entry.rendered = true;
        },
      ],
      rendered: false,
    };
    if (!this.#styles.has(hash)) {
      this.#styles.set(hash, entry);
      this.#emitUpdate();
    } else {
      entry = this.#styles.get(hash)!;
      if (entry.rendered) {
        listener();
      }
    }

    entry.listeners.push(listener);

    return () => {
      const index = entry.listeners.indexOf(listener);
      if (index === -1) {
        return;
      }

      entry.listeners.splice(index, 1);
      if (entry.listeners.length === 0) {
        this.#styles.delete(hash);
        this.#emitUpdate();
      }
    };
  }

  [Symbol.iterator](): Iterator<CSSEntry> {
    return this.#styles.values()[Symbol.iterator]();
  }
}

export const {
  Provider: StylesProvider,
  with: withStyles,
  use: useStyles,
} = createContextWithProps<StylesContext, StylesProviderProps>(
  'Pages.Styles',
  Provider =>
    ({ styles, children }) => {
      const _styles = useMemo(() => styles, [hash(styles)]);
      return <Provider value={_styles}>{children}</Provider>;
    }
);

export const useWatchStyles = () => {
  const [, setState] = useState({});
  const styles = useStyles();

  if (typeof window === 'undefined') {
    useMemo(() => {
      let immediate: NodeJS.Immediate;
      styles.on('update', () => {
        clearImmediate(immediate);
        immediate = setImmediate(() => setState({}));
      });
    }, []);
  } else {
    useEffect(() => {
      let immediate: NodeJS.Immediate;
      const handler = () => {
        clearImmediate(immediate);
        immediate = setImmediate(() => setState({}));
      };
      styles.on('update', handler);
      return () => {
        clearImmediate(immediate);
        styles.removeListener('update', handler);
      };
    }, []);
  }

  return styles;
};

export const Styles: FC<{}> = () => {
  const styles = useWatchStyles();

  const onRender = () => {
    [...styles].forEach(style => {
      style.listeners.forEach(listener => listener());
    });
  };

  useMemo(() => onRender(), []);

  const _Head = Head as any;

  return (
    <>
      {[...styles]
        .slice()
        .reverse()
        .map(({ hash, css }) => (
          <style key={hash} dangerouslySetInnerHTML={{ __html: css }} />
        ))}
    </>
  );
};
