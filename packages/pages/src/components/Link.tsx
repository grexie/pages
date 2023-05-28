import NextLink, { LinkProps } from 'next/link.js';
import { FC, MouseEvent, PropsWithChildren } from 'react';
import { useRouter } from '../hooks/useRouter.js';
import { useHead } from './Head.js';

export const Link: FC<PropsWithChildren<Omit<LinkProps, 'onClick'>>> = ({
  ...props
}) => {
  const router = useRouter();
  const head = useHead();

  const onClick = async (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    history.pushState(null, '', props.href.toString());
    location.reload();
    return;

    const [, response] = await Promise.all([
      router.prefetch(props.href.toString(), props.as?.toString(), {
        priority: true,
      }),
      fetch(props.href.toString()),
    ]);

    const html = await response.text();
    const doc = document.implementation.createHTMLDocument();
    doc.documentElement.innerHTML = html;

    const data = doc.querySelector('script[id=__PAGES_DATA__]')!;
    document.head.querySelector('script[id=__PAGES_DATA__]')!.innerHTML =
      data.innerHTML;

    router.push(props.href, props.as, {
      shallow: false,
    });
  };

  return <NextLink {...props} onClick={onClick} />;
};
