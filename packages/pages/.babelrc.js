export default {
  exclude: [/\.d\.tsx?$/],
  sourceMaps: 'inline',
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
            modules: false,
          },
        ],
      ],
    },
  ],
};
