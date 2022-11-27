/**
 * @jest-testRunner  jest-light-runner
 */

import path from 'path';
import { MockBuilder } from './MockBuilder.js';

// jest.setTimeout(30000);

describe('ModuleLoader', () => {
  let builder: MockBuilder;

  beforeEach(async () => {
    builder = new MockBuilder();
  });

  it('should build a module', async () => {
    builder.addSource('test.jsx', 'null', {}).write();
    builder.addConfig('.pages.yml', { metadata: {} });
    const stats = await builder.build();

    expect(stats.hasErrors()).toBeFalsy();

    const loader = builder.getModuleContext(stats.compilation).loaders['esm'];
    const { context, filename, source } = (await loader.modules[
      path.resolve(builder.rootDir, 'test.jsx')
    ])!;
    expect({
      context: path.relative(builder.rootDir, context),
      filename: path.relative(builder.rootDir, filename),
      source,
    }).toMatchSnapshot();
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
