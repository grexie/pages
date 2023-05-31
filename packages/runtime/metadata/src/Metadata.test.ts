import { Metadata } from './Metadata.js';

import { expect } from 'chai';

describe('Metadata', () => {
  it('should create metadata', () => {
    const m1 = new Metadata({});
    const m2 = new Metadata({ k1: { k2: 'test1' } }, m1);
    const m3 = new Metadata({ k1: { k2: 'test2' } }, m2);

    m2.k1.k2 = 'test3';
    expect(m3.k1.k2).eql('test2');
    expect(m2.k1.k2).eql('test3');
    expect(m1).eql({});
  });

  it('should unset child', () => {
    const m1 = new Metadata({});
    const m2 = new Metadata({ k1: { k2: 'test1' } }, m1);
    const m3 = new Metadata({ k1: { k2: 'test2' } }, m2);

    delete m3.k1.k2;
    expect(m3.k1.k2).eql('test1');
    expect(m2.k1.k2).eql('test1');
    expect(m1).eql({});
  });

  it.skip('should json serialize', () => {
    const m1 = new Metadata({});
    const m2 = new Metadata({ k1: { k2: 'test1' } }, m1);
    const m3 = new Metadata({ k1: { k2: 'test2' } }, m2);

    expect(JSON.parse(JSON.stringify(m1))).eql({});
    expect(JSON.parse(JSON.stringify(m2))).eql({ k1: { k2: 'test1' } });
    expect(JSON.parse(JSON.stringify(m3))).eql({ k1: { k2: 'test2' } });
  });

  it.skip('should set subobject', () => {
    const m1 = new Metadata({ k3: { k4: 'test3' } });
    const m2 = new Metadata({ k1: { k2: 'test1' } }, m1);
    const m3 = new Metadata({ k1: { k2: 'test2' } }, m2);

    m3.k3.k4 = 'test4';
    expect(JSON.parse(JSON.stringify(m1))).eql({ k3: { k4: 'test3' } });
    expect(m2).equal({
      k1: { k2: 'test1' },
      k3: { k4: 'test3' },
    });
    expect(m3).equal({
      k1: { k2: 'test2' },
      k3: { k4: 'test4' },
    });
  });
});
