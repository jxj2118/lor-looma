interface LoomaCrypto {
  getRandomValues<T extends Uint8Array>(array: T): T;
}

declare const crypto: LoomaCrypto;

declare class URL {
  constructor(url: string);
  readonly protocol: string;
}

interface LoomaPerformance {
  now(): number;
}

declare const performance: LoomaPerformance;
