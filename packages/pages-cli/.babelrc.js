export default {
  exclude: [/\.d\.tsx?$/],
  sourceMaps: true,
  overrides: [
    {
      test: [/\.tsx?$/],
      exclude: [/\/loaders\/.*\.tsx?$/, /\.(test|spec)\.tsx?$/],
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
      plugins: ['@babel/syntax-import-assertions'],
    },
    {
      test: [/\/loaders\/.*\.tsx?$/, /\.(test|spec)\.tsx?$/],
      presets: [
        '@babel/typescript',
        ['@babel/react', { runtime: 'automatic' }],
        [
          '@babel/env',
          {
            targets: 'node 16',
            modules: 'commonjs',
            exclude: ['proposal-dynamic-import'],
          },
        ],
      ],
    },
  ],
};
