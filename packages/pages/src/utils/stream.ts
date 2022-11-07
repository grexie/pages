import { Buffer } from 'buffer';
import { createResolver } from './resolvable.js';

export const toBuffer = async (
  readable: Promise<ReadableStream> | ReadableStream
): Promise<Buffer> => {
  const reader = await readable;
  return new Promise((resolve, reject) => {
    const buffers: Buffer[] = [];
    reader.getReader().read();
    reader.on('data', buffer => buffers.push(buffer));
    reader.on('end', () => resolve(Buffer.concat(buffers)));
    reader.on('error', err => reject(err));
  });
};

export const toString = async (
  readable: Promise<Readable> | Readable
): Promise<string> => (await toBuffer(readable)).toString();

export class WritableBuffer
  extends WritableStream
  implements PromiseLike<Buffer>
{
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

  getWriter(): WritableStreamDefaultWriter<Buffer> {
    return new WritableStreamDefaultWriter(
      new WritableStream({
        write: async (buffer: Buffer): Promise<void> => {
          this.#buffers.push(buffer);
        },
        close: async (): Promise<void> => {
          this.#resolver.resolve(Buffer.concat(this.#buffers));
        },
      })
    );
  }
}
