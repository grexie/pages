import path from 'path';
import { type MockBuilder } from './MockBuilder.js';
import { jest } from '@jest/globals';

jest.setTimeout(30000);

describe('ModuleLoader2', () => {
  let builder: MockBuilder;

  beforeEach(async () => {
    let { MockBuilder } = await import('./MockBuilder.js');
    builder = new MockBuilder();
  });

  it('should build a module', async () => {
    builder.addSource('test.jsx', 'null', {}).write();
    builder.addConfig('.pages.yml', { metadata: {} });
    const stats = await builder.build();
    const loader = builder.getModuleContext(stats.compilation).loaders['esm'];
    const { context, filename, source } = (await loader.modules[
      path.resolve(builder.rootDir, 'test.jsx')
    ])!;
    expect({ context, filename, source }).toMatchSnapshot();
  });

  it.todo('should rebuild a module already built in the current compilation');
  it.todo('should require a module');
  it.todo(
    'should load a module that requires compilation when requiring that module'
  );
  it.todo("should reuse modules that haven't been evicted");
  it.todo('should reload modules that have been evicted');
  it.todo('should evict all modules on reset');
});
