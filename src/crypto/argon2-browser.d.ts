declare module "argon2-browser" {
  export const ArgonType: { Argon2d: 0; Argon2i: 1; Argon2id: 2 };
  export function hash(options: {
    pass: string | Uint8Array;
    salt: Uint8Array;
    type: number;
    time: number;
    mem: number;
    parallelism: number;
    hashLen: number;
    version: number;
  }): Promise<{ hash: Uint8Array; hashHex: string; encoded: string }>;
  const argon2: { ArgonType: typeof ArgonType; hash: typeof hash };
  export default argon2;
}
