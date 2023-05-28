export default {
  exclude: [/\.d\.tsx?$/],
  sourceMaps: true,
  env: {
    esm: {
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
    commonjs: {
      test: [/\.ctsx?$/],
      exclude: [/\.(test|spec)\.tsx?$/],
      presets: [
        ['@babel/typescript', { isTSX: true, allExtensions: true }],
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
  },
  overrides: [
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
