import {
  documentNote,
  earlierDocumentNote,
  formatDocumentBytes,
  MAX_PIGGY_DOCUMENT_BYTES,
  MAX_PIGGY_DOCUMENTS,
} from "@/domains/ledger-ai/domain/piggyDocuments";
import { ocrDocumentMime } from "@/domains/statements/domain/ocrDocumentTypes";
import type { UIMessage } from "ai";

export type PiggyDocument = {
  index: number;
  filename: string;
  mediaType: string;
  bytes: Buffer;
};

const DATA_URL = /^data:([^;,]+)?(;base64)?,([\s\S]*)$/;

export function decodeDataUrl(url: string): Buffer | null {
  const match = DATA_URL.exec(url);
  if (!match) return null;
  const [, , base64, payload] = match;
  return base64
    ? Buffer.from(payload ?? "", "base64")
    : Buffer.from(decodeURIComponent(payload ?? ""), "utf8");
}

/**
 * Pull file parts off the newest user message into server-side documents and
 * replace every file part with a short text note. Chat models on OpenRouter
 * cannot read PDFs reliably, so Piggy reaches the bytes through tools instead.
 */
export function extractPiggyDocuments(messages: UIMessage[]): {
  messages: UIMessage[];
  documents: PiggyDocument[];
  error?: string;
} {
  const lastUserIndex = messages.findLastIndex((m) => m.role === "user");
  const documents: PiggyDocument[] = [];
  let total = 0;
  let error: string | undefined;

  const next = messages.map((message, messageIndex) => {
    if (!message.parts.some((part) => part.type === "file")) return message;
    const isLatest = messageIndex === lastUserIndex;
    const parts = message.parts.map((part) => {
      if (part.type !== "file") return part;
      const filename = part.filename ?? "document";
      if (!isLatest) {
        return { type: "text" as const, text: earlierDocumentNote(filename) };
      }
      if (documents.length >= MAX_PIGGY_DOCUMENTS) {
        error ??= `Only the first ${MAX_PIGGY_DOCUMENTS} files were kept.`;
        return { type: "text" as const, text: earlierDocumentNote(filename) };
      }
      const bytes = decodeDataUrl(part.url);
      if (!bytes) {
        error ??= `Could not read "${filename}".`;
        return { type: "text" as const, text: earlierDocumentNote(filename) };
      }
      total += bytes.byteLength;
      if (total > MAX_PIGGY_DOCUMENT_BYTES) {
        error ??= `Attachments over ${formatDocumentBytes(MAX_PIGGY_DOCUMENT_BYTES)} per message were dropped.`;
        return { type: "text" as const, text: earlierDocumentNote(filename) };
      }
      const doc: PiggyDocument = {
        index: documents.length + 1,
        filename,
        mediaType: ocrDocumentMime(filename, part.mediaType),
        bytes,
      };
      documents.push(doc);
      return {
        type: "text" as const,
        text: documentNote({ ...doc, bytes: bytes.byteLength }),
      };
    });
    return { ...message, parts } as UIMessage;
  });

  return { messages: next, documents, error };
}
