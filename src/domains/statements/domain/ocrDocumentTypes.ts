/** Shared accept list for statement + loan OCR uploads. */

export const OCR_DOCUMENT_EXTENSIONS = [
  "pdf",
  "png",
  "jpg",
  "jpeg",
  "webp",
  "avif",
  "heic",
  "heif",
  "gif",
  "bmp",
] as const;

/** Bank downloads that already have text — skip OCR. */
export const STATEMENT_TEXT_EXTENSIONS = [
  "csv",
  "tsv",
  "ofx",
  "qfx",
  "qif",
  "qbo",
  "txt",
  "html",
  "htm",
] as const;

export const STATEMENT_UPLOAD_EXTENSIONS = [
  ...OCR_DOCUMENT_EXTENSIONS,
  ...STATEMENT_TEXT_EXTENSIONS,
] as const;

export const OCR_DOCUMENT_ACCEPT =
  "application/pdf,.pdf,image/png,.png,image/jpeg,.jpg,.jpeg,image/webp,.webp,image/avif,.avif,image/heic,.heic,image/heif,.heif,image/gif,.gif,image/bmp,.bmp";

export const STATEMENT_UPLOAD_ACCEPT = [
  OCR_DOCUMENT_ACCEPT,
  "text/csv,.csv,.tsv,text/tab-separated-values",
  "application/x-ofx,.ofx,.qfx,.qbo",
  "application/vnd.intu.qfx,application/vnd.intu.qbo",
  "application/x-qif,.qif",
  "text/plain,.txt",
  "text/html,.html,.htm",
].join(",");

export const UNSUPPORTED_STATEMENT_FILE =
  "Use a PDF, photo, CSV, OFX, QFX, QIF, or TXT statement export.";

const EXT_MIME: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  avif: "image/avif",
  heic: "image/heic",
  heif: "image/heif",
  gif: "image/gif",
  bmp: "image/bmp",
  csv: "text/csv",
  tsv: "text/tab-separated-values",
  ofx: "application/x-ofx",
  qfx: "application/vnd.intu.qfx",
  qif: "application/x-qif",
  qbo: "application/vnd.intu.qbo",
  txt: "text/plain",
  html: "text/html",
  htm: "text/html",
};

const STATEMENT_TEXT_MIMES = new Set([
  "text/csv",
  "text/tab-separated-values",
  "text/plain",
  "text/ofx",
  "application/x-ofx",
  "application/ofx",
  "application/vnd.intu.qfx",
  "application/vnd.intu.qbo",
  "application/x-qif",
  "application/qif",
  "text/html",
  "application/xhtml+xml",
]);

export function fileExtension(filename: string) {
  const match = filename.toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1] ?? "";
}

function hasExt(list: readonly string[], filename: string) {
  return list.includes(fileExtension(filename));
}

export function isOcrDocumentFilename(filename: string) {
  return hasExt(OCR_DOCUMENT_EXTENSIONS, filename);
}

export function isStatementTextFilename(filename: string) {
  return hasExt(STATEMENT_TEXT_EXTENSIONS, filename);
}

export function isStatementUploadFilename(filename: string) {
  return hasExt(STATEMENT_UPLOAD_EXTENSIONS, filename);
}

export function isStatementTextMime(mimeType?: string | null) {
  const type = mimeType?.trim().toLowerCase() ?? "";
  return STATEMENT_TEXT_MIMES.has(type);
}

export function isStatementTextSource(
  filename: string,
  mimeType?: string | null,
) {
  if (isStatementTextFilename(filename)) return true;
  if (isOcrDocumentFilename(filename)) return false;
  return isStatementTextMime(mimeType);
}

export function isOcrDocumentFile(file: File) {
  if (isOcrDocumentFilename(file.name)) return true;
  const type = file.type.toLowerCase();
  return type === "application/pdf" || type.startsWith("image/");
}

export function isStatementUploadFile(file: File) {
  if (isStatementUploadFilename(file.name)) return true;
  if (isOcrDocumentFile(file)) return true;
  return isStatementTextMime(file.type);
}

export function isPdfFilename(filename: string) {
  return fileExtension(filename) === "pdf";
}

export function isImageFilename(filename: string) {
  const ext = fileExtension(filename);
  return ext !== "pdf" && hasExt(OCR_DOCUMENT_EXTENSIONS, filename);
}

/** MIME for Mistral data URLs / uploads. Prefers File.type when present. */
export function ocrDocumentMime(filename: string, fileType?: string | null) {
  const trimmed = fileType?.trim().toLowerCase();
  if (trimmed && trimmed !== "application/octet-stream") return trimmed;
  return EXT_MIME[fileExtension(filename)] ?? "application/octet-stream";
}

export function decodeStatementBytes(bytes: Buffer) {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return bytes.subarray(2).toString("utf16le");
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    const swapped = Buffer.allocUnsafe(bytes.length - 2);
    for (let i = 2; i + 1 < bytes.length; i += 2) {
      swapped[i - 2] = bytes[i + 1] ?? 0;
      swapped[i - 1] = bytes[i] ?? 0;
    }
    return swapped.toString("utf16le");
  }
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xef &&
    bytes[1] === 0xbb &&
    bytes[2] === 0xbf
  ) {
    return bytes.subarray(3).toString("utf8");
  }

  const utf8 = bytes.toString("utf8");
  const replacements = (utf8.match(/\uFFFD/g) ?? []).length;
  if (replacements > 0 && replacements / Math.max(utf8.length, 1) > 0.02) {
    return bytes.toString("latin1");
  }
  return utf8;
}

export function statementExportMarkdown(bytes: Buffer) {
  return `## Page 1\n\n${decodeStatementBytes(bytes).trim()}`;
}
