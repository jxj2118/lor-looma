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

declare function queueMicrotask(callback: () => void): void;

declare function atob(data: string): string;
declare function btoa(data: string): string;

declare class TextEncoder {
  encode(input?: string): Uint8Array;
}

declare class TextDecoder {
  constructor(label?: string);
  decode(input?: Uint8Array<ArrayBuffer> | Uint8Array): string;
}

interface LoomaByteReader {
  read(): Promise<{ done: boolean; value?: Uint8Array }>;
}

interface LoomaByteWriter {
  write(chunk: Uint8Array<ArrayBuffer>): Promise<void>;
  close(): Promise<void>;
}

declare class CompressionStream {
  constructor(format: 'deflate-raw');
  readonly readable: { getReader(): LoomaByteReader };
  readonly writable: { getWriter(): LoomaByteWriter };
}

declare class DecompressionStream {
  constructor(format: 'deflate-raw');
  readonly readable: { getReader(): LoomaByteReader };
  readonly writable: { getWriter(): LoomaByteWriter };
}
