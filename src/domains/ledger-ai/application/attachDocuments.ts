import {
  MAX_PIGGY_DOCUMENT_BYTES,
  MAX_PIGGY_DOCUMENTS,
  formatDocumentBytes,
} from "@/domains/ledger-ai/domain/piggyDocuments";
import {
  isOcrDocumentFile,
  ocrDocumentMime,
} from "@/domains/statements/domain/ocrDocumentTypes";
import type { FileUIPart } from "ai";

/**
 * Add dropped/picked files to the pending list, enforcing count, size, and
 * type. Returns the new list plus a message for anything rejected.
 */
export function addPiggyDocuments(current: File[], incoming: File[]) {
  const next = [...current];
  const rejected: string[] = [];
  let total = current.reduce((sum, file) => sum + file.size, 0);

  for (const file of incoming) {
    if (next.some((f) => f.name === file.name && f.size === file.size)) continue;
    if (!isOcrDocumentFile(file)) {
      rejected.push(`${file.name}: only PDF or image files`);
      continue;
    }
    if (next.length >= MAX_PIGGY_DOCUMENTS) {
      rejected.push(`${file.name}: up to ${MAX_PIGGY_DOCUMENTS} files per message`);
      continue;
    }
    if (total + file.size > MAX_PIGGY_DOCUMENT_BYTES) {
      rejected.push(
        `${file.name}: over the ${formatDocumentBytes(MAX_PIGGY_DOCUMENT_BYTES)} limit per message. Use the Statements page for big files.`,
      );
      continue;
    }
    total += file.size;
    next.push(file);
  }
  return { files: next, rejected };
}

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Could not read file"));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}

/** Files → AI SDK file parts (data URLs) for sendMessage. */
export async function documentsToFileParts(files: File[]): Promise<FileUIPart[]> {
  return Promise.all(
    files.map(async (file) => ({
      type: "file" as const,
      mediaType: ocrDocumentMime(file.name, file.type),
      filename: file.name,
      url: await readAsDataUrl(file),
    })),
  );
}

/** Files from a drop or paste event, if any. */
export function filesFromDataTransfer(transfer: DataTransfer | null) {
  if (!transfer) return [];
  return Array.from(transfer.files ?? []);
}

/**
 * Image files from a paste event. Browsers name clipboard screenshots
 * `image.png`, so rename them to something readable and unique. Returns []
 * when the clipboard holds no image, so plain text pastes stay untouched.
 */
export function imagesFromClipboard(transfer: DataTransfer | null) {
  const images = filesFromDataTransfer(transfer).filter((file) =>
    file.type.toLowerCase().startsWith("image/"),
  );
  return images.map((file, index) => {
    const ext = file.type.split("/")[1]?.replace("jpeg", "jpg") ?? "png";
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const suffix = images.length > 1 ? `-${index + 1}` : "";
    return new File([file], `screenshot-${stamp}${suffix}.${ext}`, {
      type: file.type,
    });
  });
}
