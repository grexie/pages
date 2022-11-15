import { Readable, Writable } from 'stream';
import { createResolver } from './resolvable.js';

export const toBuffer = async (
  readable: Promise<Readable> | Readable
): Promise<Buffer> => {
  const reader = await readable;
  return new Promise((resolve, reject) => {
    const buffers: Buffer[] = [];
    reader.on('data', buffer => buffers.push(buffer));
    reader.on('end', () => resolve(Buffer.concat(buffers)));
    reader.on('error', err => reject(err));
  });
};

export const toString = async (
  readable: Promise<Readable> | Readable
): Promise<string> => (await toBuffer(readable)).toString();

export class WritableBuffer extends Writable implements PromiseLike<Buffer> {
  readonly #buffers: Buffer[] = [];
  readonly #resolver = createResolver<Buffer>();

  get then() {
    return this.#resolver.then.bind(this.#resolver);
  }

  get catch() {
    return this.#resolver.catch.bind(this.#resolver);
  }

  get finally() {
    return this.#resolver.finally.bind(this.#resolver);
  }

  _write(
    buffer: Buffer,
    _: BufferEncoding,
    callback: (error?: Error) => void
  ): void {
    this.#buffers.push(buffer);
    callback();
  }

  _final(callback: (error?: Error) => void): void {
    this.#resolver.resolve(Buffer.concat(this.#buffers));
    callback();
  }
}
