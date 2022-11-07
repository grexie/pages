import { Buffer } from 'buffer';
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

  then<TResult1 = void, TResult2 = never>(
    onfulfilled?:
      | ((value: Buffer) => TResult1 | PromiseLike<TResult1>)
      | null
      | undefined,
    onrejected?:
      | ((reason: any) => TResult2 | PromiseLike<TResult2>)
      | null
      | undefined
  ): Promise<TResult1 | TResult2> {
    return this.#resolver.then(onfulfilled, onrejected);
  }

  catch<TResult = never>(
    onrejected?:
      | ((reason: any) => TResult | PromiseLike<TResult>)
      | null
      | undefined
  ): Promise<Buffer | TResult> {
    return this.then(x => x, onrejected);
  }

  finally(onfinally?: (() => void) | null | undefined): Promise<Buffer> {
    return this.then(x => x).finally(onfinally);
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
