import NextLink, { LinkProps } from 'next/link.js';
import { FC, MouseEvent, PropsWithChildren } from 'react';
import { useRouter } from '../hooks/useRouter.js';
import { useHead } from './Head.js';
import { useUpdatePagesContext } from '../hooks/usePagesQuery.js';

export const Link: FC<PropsWithChildren<JSX.IntrinsicElements['a']>> = ({
  ...props
}) => {
  const router = useRouter();
  const head = useHead();
  const update = useUpdatePagesContext();

  const trimBasePath = (href: string): string => {
    let basePath = router.basePath;
    if (basePath.endsWith('/')) {
      basePath = basePath.substring(0, basePath.length - 1);
    }
    return href.substring(basePath.length) || '/';
  };

  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    props.onClick?.(event);

    if (event.defaultPrevented) {
      return;
    }

    event.preventDefault();

    (async () => {
      if (!props.href) {
        return;
      }

      try {
        const [, response] = await Promise.all([
          router.prefetch(trimBasePath(props.href)),
          fetch(props.href),
        ]);

        const html = await response.text();
        const doc = document.implementation.createHTMLDocument();
        doc.documentElement.innerHTML = html;

        const data = doc.querySelector('script[id=__PAGES_DATA__]')!;
        document.head.querySelector('script[id=__PAGES_DATA__]')!.innerHTML =
          data.innerHTML;
      } catch (err) {
        throw new Error('unable to find pages data in: ' + props.href);
      }

      update?.({ shallow: true });
      await router.push(trimBasePath(props.href));
      update?.();
    })();
  };

  return <a {...props} onClick={onClick} />;
};
