import NextLink, { LinkProps } from 'next/link.js';
import { FC, MouseEvent, PropsWithChildren } from 'react';
import { useRouter } from '../hooks/useRouter.js';
import { useHead } from './Head.js';
import { useUpdatePagesContext } from '../hooks/usePagesQuery.js';

export const Link: FC<PropsWithChildren<Omit<LinkProps, 'onClick'>>> = ({
  ...props
}) => {
  const router = useRouter();
  const head = useHead();
  const update = useUpdatePagesContext();

  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();

    (async () => {
      const [, response] = await Promise.all([
        router.prefetch(props.href.toString(), props.as?.toString()),
        fetch(props.as?.toString() ?? props.href?.toString()),
      ]);

      const html = await response.text();
      const doc = document.implementation.createHTMLDocument();
      doc.documentElement.innerHTML = html;

      const data = doc.querySelector('script[id=__PAGES_DATA__]')!;
      document.head.querySelector('script[id=__PAGES_DATA__]')!.innerHTML =
        data.innerHTML;

      update?.({ shallow: true });
      await router.push(props.href, props.as);
      update?.();
    })();
  };

  return <NextLink {...props} onClick={onClick} />;
};
