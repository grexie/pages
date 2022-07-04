import { MockBuilder } from './MockBuilder';
import path from 'path';
describe('MockBuilder', () => {
  it.only('should write files', () => {
    const builder = new MockBuilder();
    const dirname = path.resolve(builder.rootDir, '__test__');

    builder.write('__test__/test.txt', 'test');

    expect(
      builder.builder.defaultFiles
        .readFileSync(path.resolve(dirname, 'test.txt'))
        .toString()
    ).toEqual('test');
    expect(
      builder.fs.readFileSync(path.resolve(dirname, 'test.txt')).toString()
    ).toEqual('test');
    expect(builder.fs.readdirSync(dirname)).toEqual(['test.txt']);
  });
});
