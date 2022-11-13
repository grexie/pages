import { Cache } from './Cache';
import { FileSystem } from './FileSystem';
import { Volume } from 'memfs';
import { createResolver } from './utils/resolvable';

const timeout = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const immediate = () => new Promise(resolve => setImmediate(resolve));

describe('Cache', () => {
  let cache: Cache;
  let fs: FileSystem;

  beforeEach(() => {
    const volume = new Volume();
    fs = new FileSystem().add('/tmp', volume, true);
    cache = new Cache({
      storage: {
        ephemeral: fs,
        persistent: fs,
      },
      cacheDir: '/tmp',
    });
  });

  it('should detect deadlock', async () => {
    const filename = 'test';
    const resolver1 = createResolver();
    const resolver2 = createResolver();
    await expect(
      Promise.all([
        resolver1.then(() =>
          cache.lock(
            filename,
            async cache => {
              resolver2.resolve();
              await cache.set(filename, 'test2', Date.now());
            },
            true
          )
        ),
        cache.lock(filename, async cache => {
          resolver1.resolve();
          await resolver2;
          await cache.set(filename, 'test1', Date.now());
        }),
      ])
    ).rejects.toThrow('lock fail');
  });

  it('should detect deadlock at child', async () => {
    const filename1 = 'test1';
    const filename2 = 'test2';
    const resolver1 = createResolver();
    const resolver2 = createResolver();
    await expect(
      Promise.all([
        resolver1.then(() =>
          cache.lock(filename1, async cache =>
            cache.lock(
              filename2,
              async () => {
                resolver2.resolve();
                await cache.set(filename2, 'test2', Date.now());
              },
              true
            )
          )
        ),
        cache.lock(filename2, async cache => {
          resolver1.resolve();
          await resolver2;
          await cache.set(filename2, 'test1', Date.now());
        }),
      ])
    ).rejects.toThrow('lock fail');
  });

  it('should allow lock at child if not attained through lock', async () => {
    const filename1 = 'test';
    const filename2 = 'test2';
    await cache.lock(filename1, async cache => {
      await cache.set(filename2, 'test1', Date.now());
    });
  });

  it('should allow lock at child that have been attained through lock', async () => {
    const filename = 'test';
    await cache.lock(filename, async cache => {
      await cache.set(filename, 'test1', Date.now());
    });
  });

  it('should allow read locks', async () => {
    const filename = 'test';
    await cache.set(filename, 'test1', Date.now());
    expect(
      (
        await cache.readLock(filename, async cache2 => {
          return await cache2.get(filename);
        })
      ).toString()
    ).toBe('test1');
  });
});
