import { ObjectProxy } from './ObjectProxy.js';

describe('ObjectProxy', () => {
  it('should toJSON on simple object', () => {
    const o1 = ObjectProxy.create({ k1: { k2: 'test' } });

    expect(o1.toJSON()).toEqual({ k1: { k2: 'test' } });
  });

  it('should toJSON on inherited objects', () => {
    const o1 = ObjectProxy.create({ k1: { k2: 'test' } });
    const o2 = ObjectProxy.create({}, o1);

    expect(o2.toJSON()).toEqual({ k1: { k2: 'test' } });
  });

  it('should deep merge toJSON', () => {
    const o1 = ObjectProxy.create({ k1: { k2: 'test' }, k2: { k3: 'test' } });
    const o2 = ObjectProxy.create({ k1: { k2: { k3: 'test' } } }, o1);
    const o3 = ObjectProxy.create({ k1: { k2: { k3: ['v1', 'v2'] } } }, o2);
    const o4 = ObjectProxy.create({ k1: { k2: { k3: { k4: 'test' } } } }, o3);

    expect(o2.toJSON()).toEqual({
      k1: { k2: { k3: 'test' } },
      k2: { k3: 'test' },
    });
    expect(o3.toJSON()).toEqual({
      k1: { k2: { k3: ['v1', 'v2'] } },
      k2: { k3: 'test' },
    });
    expect(o4.toJSON()).toEqual({
      k1: { k2: { k3: { k4: 'test' } } },
      k2: { k3: 'test' },
    });
    expect(o3.toJSON()).toEqual({
      k1: { k2: { k3: ['v1', 'v2'] } },
      k2: { k3: 'test' },
    });
    expect(o2.toJSON()).toEqual({
      k1: { k2: { k3: 'test' } },
      k2: { k3: 'test' },
    });
  });

  it('should inherit values', () => {
    const o1 = ObjectProxy.create({
      k1: { [Symbol.for('test2')]: false },
      [Symbol.for('test')]: true,
    });
    const o2 = ObjectProxy.create({ k1: { k2: ['test'] } }, o1);
    const o3 = ObjectProxy.create({ k1: { hello: 'world' } }, o2);
    const o4 = ObjectProxy.create({ k1: { k2: null } }, o3);
    const o5 = ObjectProxy.create({ k1: { k2: undefined } }, o4);

    expect(o5.k1.k2).toBeNull();
    expect(o4.k1.k2).toBeNull();
    expect(o3.k1.k2).toEqual(['test']);
    expect(o2.k1.k2).toEqual(['test']);
    expect(o1.k1.k2).toBeUndefined();
  });

  it('should set a value on proxy at root', () => {
    const o1 = ObjectProxy.create({ k1: {} });
    const o2 = ObjectProxy.create({}, o1);

    o2.k1.k2 = 'test';
    expect(o1.k1).toEqual({});
    expect(o2.k1.k2).toEqual('test');
    expect(o2.k1).toEqual({ k2: 'test' });
  });

  it('should set a value on proxy at subobject', () => {
    const o1 = ObjectProxy.create({ k1: {} });
    const o2 = ObjectProxy.create({ k1: {} }, o1);

    o2.k1.k2 = 'test';
    expect(o1.k1).toEqual({});
    expect(Object.keys(o2)).toEqual(['k1']);
    expect(Object.keys(o2.k1)).toEqual(['k2']);
    expect(o2.k1.k2).toEqual('test');
    expect(o2.k1).toEqual({ k2: 'test' });
  });

  it('should set a value on object at root', () => {
    const o1 = ObjectProxy.create({ k1: {} });
    const o2 = ObjectProxy.create({}, o1);

    o2.k1.k2 = 'test';
    expect(ObjectProxy.get(o1)).toEqual({ k1: {} });
    expect(ObjectProxy.get(o2)).toEqual({ k1: { k2: 'test' } });
  });

  it('should set a value on object at subobject', () => {
    const o1 = ObjectProxy.create({ k1: {} });
    const o2 = ObjectProxy.create({ k1: {} }, o1);

    o2.k1.k2 = 'test';
    expect(ObjectProxy.get(o1)).toEqual({ k1: {} });
    expect(ObjectProxy.get(o2)).toEqual({ k1: { k2: 'test' } });
  });

  it('should get subobject value from child', () => {
    const o1 = ObjectProxy.create({ k1: {} });
    const o2 = ObjectProxy.create({ k1: {} }, o1);

    o2.k1.k2 = 'test';
    expect(ObjectProxy.get(o1)).toEqual({ k1: {} });
    o1.k1.k3 = 'test2';
    expect(ObjectProxy.get(o1.k1)).toEqual({ k3: 'test2' });
    expect(ObjectProxy.get(o2.k1)).toEqual({ k2: 'test' });
  });

  it('should perform toJSON on child', () => {
    const o1 = ObjectProxy.create({ k1: { k2: 'test' } });
    const o2 = ObjectProxy.create({ k1: {} }, o1);

    expect(o2.toJSON()).toEqual({ k1: { k2: 'test' } });
    expect(o2.k1.toJSON()).toEqual({ k2: 'test' });
    o2.k1.k3 = 'test2';
    expect(o2.toJSON()).toEqual({ k1: { k2: 'test', k3: 'test2' } });
    expect(o2.k1.toJSON()).toEqual({ k2: 'test', k3: 'test2' });
  });

  it('should delete', () => {
    const o1 = ObjectProxy.create({ k1: {} });
    const o2 = ObjectProxy.create({ k1: { k2: ['test'] } }, o1);
    const o3 = ObjectProxy.create({ k1: {} }, o2);
    const o4 = ObjectProxy.create({ k1: { k2: null } }, o3);
    const o5 = ObjectProxy.create({ k1: { k2: undefined } }, o4);
  });
});
