/** Shared accept list for statement + loan OCR uploads (Mistral OCR). */

export const OCR_DOCUMENT_EXTENSIONS = [
  "pdf",
  "png",
  "jpg",
  "jpeg",
  "webp",
  "avif",
  "heic",
  "heif",
] as const;

export const OCR_DOCUMENT_ACCEPT =
  "application/pdf,.pdf,image/png,.png,image/jpeg,.jpg,.jpeg,image/webp,.webp,image/avif,.avif,image/heic,.heic,image/heif,.heif";

const EXT_MIME: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  avif: "image/avif",
  heic: "image/heic",
  heif: "image/heif",
};

export function fileExtension(filename: string) {
  const match = filename.toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1] ?? "";
}

export function isOcrDocumentFilename(filename: string) {
  return (OCR_DOCUMENT_EXTENSIONS as readonly string[]).includes(
    fileExtension(filename),
  );
}

export function isOcrDocumentFile(file: File) {
  if (isOcrDocumentFilename(file.name)) return true;
  const type = file.type.toLowerCase();
  return (
    type === "application/pdf" ||
    type.startsWith("image/")
  );
}

export function isPdfFilename(filename: string) {
  return fileExtension(filename) === "pdf";
}

export function isImageFilename(filename: string) {
  const ext = fileExtension(filename);
  return ext !== "pdf" && (OCR_DOCUMENT_EXTENSIONS as readonly string[]).includes(ext);
}

/** MIME for Mistral data URLs / uploads. Prefers File.type when present. */
export function ocrDocumentMime(filename: string, fileType?: string | null) {
  const trimmed = fileType?.trim().toLowerCase();
  if (trimmed && trimmed !== "application/octet-stream") return trimmed;
  return EXT_MIME[fileExtension(filename)] ?? "application/octet-stream";
}
