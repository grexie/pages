module.exports = {
  verbose: true,
  clearMocks: true,
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coveragePathIgnorePatterns: ['/node_modules/'],
  // projects: ['packages/*'],
  testMatch: ['**/*.(spec|test).cjs'],
  testPathIgnorePatterns: [
    '/node_modules/',
    '^.test/',
    '^__test__/',
    '^.cache/',
    '^examples/*/build/',
    '.test.ts$',
    '.test.tsx$',
  ],
};
