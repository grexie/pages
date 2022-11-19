module.exports = {
  verbose: true,
  clearMocks: true,
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coveragePathIgnorePatterns: ['/node_modules/'],
  // projects: ['packages/*'],
  testMatch: ['**/*.(spec|test).js'],
  testPathIgnorePatterns: [
    '/node_modules/',
    '^.test/',
    '^__test__/',
    '^.cache/',
    '^examples/*/build/',
  ],
};
