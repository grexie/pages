/**
 * @jest-runner jest-light-runner
 */

import path from 'path';
import { MockBuilder } from './MockBuilder.js';

describe('ModuleLoader', () => {
  let builder: MockBuilder;

  beforeEach(async () => {
    builder = new MockBuilder();
  });

  it('should build a module', async () => {
    builder.addSource('test.jsx', 'null', {}).write();
    builder.addConfig('.pages.yml', {});
    const { stats, result } = await builder.build(async compilation => {
      const modules = builder.getModuleContext(compilation);
      return await modules.requireModule('/pages', '/test');
    });

    expect(stats.hasErrors()).toBeFalsy();

    const { context, filename, source } = result!;
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
