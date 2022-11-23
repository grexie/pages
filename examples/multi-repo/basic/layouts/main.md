---
styles:
  site: ./site.global.scss
  main: ./main.module.scss
---

import { Once, Head, Metadata } from '@grexie/pages';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';

<Once fallback={Block}>
  <Head>
    <title>
      <Metadata
        field="title"
        render={title => (title ? title + ' | My Site2' : 'My Site2')}
      />
    </title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link
      rel="preconnect"
      href="https://fonts.gstatic.com"
      crossOrigin="anonymous"
    />
    <link
      href="https://fonts.googleapis.com/css2?family=Domine:wght@500&family=Open+Sans:wght@400&display=swap"
      rel="stylesheet"
    />
  </Head>
  <Header className={styles.main('header')} />
  <div className={styles.main('content')}>
    <Block />
  </div>
  <Footer className={styles.main('footer')} />
</Once>