import { ObjectProxy } from '../proxy/index.js';
import { ObjectSchema } from './ObjectSchema.js';

describe('ObjectSchema', () => {
  test('it should merge', () => {
    const schema = new ObjectSchema();
    const k1 = schema.set('object', 'k1');
    k1.set<string[]>('array', 'k2');

    const o1 = ObjectProxy.create(schema.create());
    const o2 = ObjectProxy.create({ k1: { k2: ['test'] } }, o1);
    const o3 = ObjectProxy.create({}, o2);
    const o4 = ObjectProxy.create({ k1: { k2: null } }, o3);
    const o5 = ObjectProxy.create({ k1: { k2: undefined } }, o4);

    expect(o1).toEqual({ k1: { k2: undefined } });
    expect(o1.k1.k2).toBeUndefined();
    expect(o2).toEqual({ k1: { k2: ['test'] } });
    expect(o2.k1.k2).toEqual(['test']);
    expect(o3).toEqual({ k1: { k2: ['test'] } });
    expect(o3.k1.k2).toEqual(['test']);
    expect(o4).toEqual({ k1: { k2: [] } });
    expect(o4.k1.k2).toEqual([]);
    expect(o5).toEqual({ k1: { k2: [] } });
    expect(o5.k1.k2).toEqual([]);
    Object.assign(o5.k1, { k2: ['test5'] });
    expect(o5).toEqual({ k1: { k2: ['test5'] } });
  });

  test('it should merge new properties', () => {
    const schema = new ObjectSchema();
    const k1 = schema.set('object', 'k1');
    k1.set<string[]>('array', 'k2', ({ merge, current, next }) => {
      next = merge(current, next);

      if (!next) {
        return next;
      }

      next[0] = `test:${next[0]}`;
      return next;
    });

    const o1 = ObjectProxy.create(schema.create({ k1: {} }));
    const o2 = ObjectProxy.create({ k1: { k2: ['test'] } }, o1);
    const o3 = ObjectProxy.create({}, o2);
    const o4 = ObjectProxy.create({ k1: { k2: ['test4', 'test5'] } }, o3);
    const o5 = ObjectProxy.create({ k1: { k2: undefined } }, o4);

    o2.k1.k2 = ['test2', 'test3'];
    expect(o2.k1.k2).toEqual(['test:test2', 'test3']);
    expect(ObjectProxy.get(o2)).toEqual({
      k1: { k2: ['test:test2', 'test3'] },
    });
    expect(o2.toJSON()).toEqual({ k1: { k2: ['test:test2', 'test3'] } });
    expect(o2).toEqual({ k1: { k2: ['test:test2', 'test3'] } });
    expect(o1).toEqual({ k1: { k2: undefined } }); // TODO cleanup so it doesn't create unnecessary objects
    expect(o3).toEqual({ k1: { k2: ['test:test2', 'test3'] } });
    expect(o4).toEqual({ k1: { k2: ['test:test4', 'test5'] } });

    Object.assign(o2, { k1: { k2: ['test6', 'test7'] } });
    expect(o2.toJSON()).toEqual({ k1: { k2: ['test:test6', 'test7'] } });
    expect(JSON.stringify(o2.k1)).toEqual(
      JSON.stringify({ k2: ['test:test6', 'test7'] })
    );
  });
});
