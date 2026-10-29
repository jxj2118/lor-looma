interface LoomaCrypto {
  getRandomValues<T extends Uint8Array>(array: T): T;
}

declare const crypto: LoomaCrypto;
