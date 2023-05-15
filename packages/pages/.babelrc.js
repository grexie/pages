export default {
  exclude: [/\.d\.tsx?$/],
  sourceMaps: true,
  overrides: [
    {
      test: [/\.tsx?$/],
      exclude: [/\.(test|spec)\.tsx?$/],
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
      test: [/\.(test|spec)\.tsx?$/],
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
