module.exports = {
  exclude: [/\.d\.tsx?$/],
  sourceMaps: true,
  overrides: [
    {
      test: [/\.[jt]sx?$/],
      exclude: [/\.(test|spec)\.tsx?$/],
      presets: [
        '@babel/typescript',
        ['@babel/react', { runtime: 'automatic' }],
        [
          '@babel/env',
          {
            targets: 'node 16',
            modules: 'commonjs',
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
