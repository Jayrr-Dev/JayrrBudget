const DATA_URL = /^data:([^;,]+)?(;base64)?,([\s\S]*)$/;

/** Turn a chat file part's data URL into a File the upload API can consume. */
export function fileFromChatPart(part: {
  url: string;
  filename?: string;
  mediaType?: string;
}): File | null {
  const match = DATA_URL.exec(part.url);
  if (!match) return null;
  const [, declaredType, base64, payload] = match;
  if (!base64) return null;
  try {
    const binary = atob(payload ?? "");
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    const type = part.mediaType || declaredType || "application/pdf";
    return new File([bytes], part.filename || "statement.pdf", { type });
  } catch {
    return null;
  }
}
