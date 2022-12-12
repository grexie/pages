import path from 'path';

export const resolveSnapshotPath = (testPath, snapshotExtension) =>
  path.dirname(testPath.replace(/\/lib\//, '/src/')) +
  '/__snapshots__/' +
  path.basename(testPath);
export const resolveTestPath = (snapshotFilePath, snapshotExtension) =>
  snapshotFilePath.replace(/__snapshots__\//, '').replace(/\/src\//, '/lib/');
export const testPathForConsistencyCheck = './lib/some.test.js';
