export interface ContextOptions {}

export class Context {
  readonly isRuntime: boolean;
  readonly isServer: boolean;
  readonly isBuild: boolean;

  constructor({
    isServer = false,
    isBuild = false,
  }: ContextOptions & { isServer?: boolean; isBuild?: boolean }) {
    this.isRuntime = !isServer && !isBuild;
    this.isServer = isServer;
    this.isBuild = isBuild;
  }
}
