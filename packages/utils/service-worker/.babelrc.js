export default {
  exclude: [/\.d\.tsx?$/],
  sourceMaps: true,
  test: [/\.tsx?$/],
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
