export default {
  clearMocks: true,
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coveragePathIgnorePatterns: ['/node_modules/'],
  transform: {
    '\\.tsx?$': 'babel-jest',
  },
  projects: ['packages/*'],
};
