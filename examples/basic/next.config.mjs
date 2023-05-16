// next.config.js
import { withPages } from '@grexie/pages/next';

/** @type {import('next').NextConfig} */
const nextConfig = {
  pageExtensions: ['ts', 'tsx', 'js', 'jsx', 'md', 'mdx'],
  reactStrictMode: true,
  productionBrowserSourceMaps: true,
};

export default await withPages(nextConfig, {
  pagesDir: 'pages',
  plugins: [
    '@grexie/pages-plugin-metadata',
    '@grexie/pages-plugin-sass',
    '@grexie/pages-plugin-svg',
    '@grexie/pages-plugin-markdown',
  ],
});
