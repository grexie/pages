import { NextConfig } from 'next';
export type { StyleSheet } from '@grexie/pages-runtime-styles';
export default function SassPagesPlugin(): (config: NextConfig) => NextConfig;
