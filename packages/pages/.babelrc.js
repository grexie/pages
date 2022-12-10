export default {
  exclude: [/\.d\.tsx?$/],
  sourceMaps: true,
  presets: [
    '@babel/typescript',
    ['@babel/react', { runtime: 'automatic' }],
    [
      '@babel/env',
      {
        targets: 'node 16',
        modules: false,
      },
    ],
  ],
};
