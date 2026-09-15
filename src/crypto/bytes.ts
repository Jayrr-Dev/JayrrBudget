export type OwnedBytes = Uint8Array<ArrayBuffer>;

export function randomBytes(length: number): OwnedBytes {
  const bytes = new Uint8Array(new ArrayBuffer(length));
  crypto.getRandomValues(bytes);
  return bytes;
}

export function bytesToBase64(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (let i = 0; i < view.length; i += 0x8000) {
    binary += String.fromCharCode(...view.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

export function base64ToBytes(value: string): OwnedBytes {
  const binary = atob(value);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function concatBytes(...parts: Uint8Array[]): OwnedBytes {
  const output = new Uint8Array(new ArrayBuffer(parts.reduce((sum, part) => sum + part.length, 0)));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

export function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const output = new Uint8Array(new ArrayBuffer(bytes.byteLength));
  output.set(bytes);
  return output.buffer;
}
