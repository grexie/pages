/** @type {import('jest').Config} */

export default {
  verbose: true,
  clearMocks: true,
  collectCoverage: true,
  runner: 'jest-light-runner',
  maxWorkers: 30,
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
