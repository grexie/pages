export default {
  clearMocks: true,
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coveragePathIgnorePatterns: ['/node_modules/'],
  projects: ['packages/*'],
  testMatch: ['**/?(*.)+(spec|test).js?(x)'],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/.test/',
    '.test.ts',
    '.test.tsx',
  ],
};
