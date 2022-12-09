/** @type {import('jest').Config} */

module.exports = {
  verbose: true,
  clearMocks: true,
  collectCoverage: true,
  runner: 'jest-light-runner',
  maxWorkers: 10,
  setupFiles: ['<rootDir>/tools/jest/setup.js'],
  coverageDirectory: 'coverage',
  coveragePathIgnorePatterns: ['/node_modules/'],
  extensionsToTreatAsEsm: ['.ts', '.tsx'],
  testMatch: ['**/*.(spec|test).ts', '**/*.(spec|test).tsx'],
  testPathIgnorePatterns: [
    '/node_modules/',
    '^.test/',
    '^__test__/',
    '^.cache/',
    '^examples/*/build/',
    '__snapshots__/',
  ],
  snapshotResolver: './tools/jest/snapshotResolver.js',
};
