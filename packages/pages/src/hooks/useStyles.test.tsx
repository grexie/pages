import { renderHook } from '@testing-library/react';
import { expect } from 'chai';
import { wrapStyles } from '@grexie/pages-runtime-styles';
import { StylesContext, useStyles, withStyles } from './useStyles.js';
import { withFirstRenderProvider } from './useFirstRender.js';

describe.only('useStyles', () => {
  it('should render styles in document head', () => {
    const stylesContext = new StylesContext();
    const styles = wrapStyles(
      '1',
      'css1',
      { a: '--a', b: '--b', c: '--c' },
      { '--a': '#111', '--b': '#222', '--c': '#333' }
    );

    renderHook(
      () => {
        styles.use();

        return null;
      },
      {
        wrapper: withFirstRenderProvider(
          withStyles({ styles: stylesContext })(({ children }) => {
            const styles = useStyles();
            return <>{children}</>;
          })
        ),
      }
    );
    expect(document.head).toMatchSnapshot();
  });
});
