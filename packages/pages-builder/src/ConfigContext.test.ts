/**
 * @jest-testRunner  jest-light-runner
 */

import path from 'path';
import { MockBuilder } from './MockBuilder.js';

describe('ConfigContext', () => {
  let builder: MockBuilder;

  beforeEach(async () => {
    builder = new MockBuilder();
  });

  test('should modify config from child configs', async () => {
    builder.addConfig('.pages.yml', {
      render: true,
      mappings: ['.:/'],
      layout: ['/layouts/main'],
    });
    builder.addConfig('layouts/.pages.yml', {
      render: false,
      layout: [],
    });
    builder
      .addSource('test.jsx', 'null', {
        title: 'Test',
      })
      .write();
    builder
      .addSource('layouts/main.jsx', 'null', {
        title: 'Layout',
      })
      .write();

    const { result: config } = await builder.build(async compilation => {
      const module = await builder.config.create(compilation, [
        'layouts',
        'main',
      ]);
      return module.create();
    });

    expect(config!.layout).toEqual([]);
    Object.assign(config!, { layout: ['./Home'] });
    expect(config!.layout).toEqual(['./Home']);
    expect(config!.render).toEqual(false);
  });
});
