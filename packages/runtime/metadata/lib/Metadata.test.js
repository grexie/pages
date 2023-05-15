"use strict";

var _Metadata = require("./Metadata.js");
describe('Metadata', () => {
  it('should create metadata', () => {
    const m1 = new _Metadata.Metadata({});
    const m2 = new _Metadata.Metadata({
      k1: {
        k2: 'test1'
      }
    }, m1);
    const m3 = new _Metadata.Metadata({
      k1: {
        k2: 'test2'
      }
    }, m2);
    m2.k1.k2 = 'test3';
    expect(m3.k1.k2).toBe('test2');
    expect(m2.k1.k2).toBe('test3');
    expect(m1).toEqual({});
  });
  it('should unset child', () => {
    const m1 = new _Metadata.Metadata({});
    const m2 = new _Metadata.Metadata({
      k1: {
        k2: 'test1'
      }
    }, m1);
    const m3 = new _Metadata.Metadata({
      k1: {
        k2: 'test2'
      }
    }, m2);
    delete m3.k1.k2;
    expect(m3.k1.k2).toBe('test1');
    expect(m2.k1.k2).toBe('test1');
    expect(m1).toEqual({});
  });
  it('should json serialize', () => {
    const m1 = new _Metadata.Metadata({});
    const m2 = new _Metadata.Metadata({
      k1: {
        k2: 'test1'
      }
    }, m1);
    const m3 = new _Metadata.Metadata({
      k1: {
        k2: 'test2'
      }
    }, m2);
    expect(JSON.parse(JSON.stringify(m1))).toEqual({});
    expect(JSON.parse(JSON.stringify(m2))).toEqual({
      k1: {
        k2: 'test1'
      }
    });
    expect(JSON.parse(JSON.stringify(m3))).toEqual({
      k1: {
        k2: 'test2'
      }
    });
  });
  it('should set subobject', () => {
    const m1 = new _Metadata.Metadata({
      k3: {
        k4: 'test3'
      }
    });
    const m2 = new _Metadata.Metadata({
      k1: {
        k2: 'test1'
      }
    }, m1);
    const m3 = new _Metadata.Metadata({
      k1: {
        k2: 'test2'
      }
    }, m2);
    m3.k3.k4 = 'test4';
    expect(JSON.parse(JSON.stringify(m1))).toEqual({
      k3: {
        k4: 'test3'
      }
    });
    expect(JSON.parse(JSON.stringify(m2))).toEqual({
      k1: {
        k2: 'test1'
      },
      k3: {
        k4: 'test3'
      }
    });
    expect(JSON.parse(JSON.stringify(m3))).toEqual({
      k1: {
        k2: 'test2'
      },
      k3: {
        k4: 'test4'
      }
    });
  });
});
//# sourceMappingURL=Metadata.test.js.map