/** Normalize filename for soft duplicate matching in the picker. */
export function normalizeStatementFilename(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/** SHA-256 hex of file bytes (browser). Matches server `statementFileHash`. */
export async function sha256FileHex(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
