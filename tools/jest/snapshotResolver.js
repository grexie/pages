const path = require('path');

module.exports = {
  resolveSnapshotPath: (testPath, snapshotExtension) =>
    path.dirname(testPath.replace(/\/lib\//, '/src/')) +
    '/__snapshots__/' +
    path.basename(testPath),
  resolveTestPath: (snapshotFilePath, snapshotExtension) =>
    snapshotFilePath.replace(/__snapshots__\//, '').replace(/\/src\//, '/lib/'),
  testPathForConsistencyCheck: './lib/some.test.js',
};
