/**
 * Documents the user hands Piggy in chat (drag-drop or paper clip).
 * Shared between the composer (client) and the chat route (server).
 */

/** Max files attached to one message. */
export const MAX_PIGGY_DOCUMENTS = 4;

/**
 * Raw bytes per message, all files combined. Files travel as base64 in the
 * chat request body, which serverless hosts cap around 4.5 MB.
 */
export const MAX_PIGGY_DOCUMENT_BYTES = 3 * 1024 * 1024;

export type PiggyDocumentRef = {
  /** 1-based; what Piggy passes to document tools. */
  index: number;
  filename: string;
  mediaType: string;
  bytes: number;
};

export function formatDocumentBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Text the model sees in place of the raw file. */
export function documentNote(ref: PiggyDocumentRef) {
  return `[Attached document #${ref.index}: "${ref.filename}" (${ref.mediaType}, ${formatDocumentBytes(ref.bytes)}). Use documentIndex ${ref.index} with read_document, import_statement_document, or register_loan_from_document.]`;
}

/** Placeholder kept in older turns once the bytes are no longer sent. */
export function earlierDocumentNote(filename: string) {
  return `[Attached earlier: "${filename}". Its bytes are no longer available; ask the user to attach it again if you need it.]`;
}
