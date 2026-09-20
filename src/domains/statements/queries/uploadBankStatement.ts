import {
  formatImportProgress,
  STATEMENT_IMPORT_STEPS,
  type StatementImportProgress,
} from "@/domains/statements/domain/importProgress";
import type { ImportBankStatementSuccess } from "@/domains/statements/domain/importResult";
import { isStatementTextSource } from "@/domains/statements/domain/ocrDocumentTypes";
import type { OcrMode } from "@/domains/statements/domain/ocrMode";
import { ocrDocumentLocally } from "@/domains/statements/infrastructure/localOcr";
import { assertOnlineForWrite } from "@/shared/offline/offlineWriteGuard";

type StreamEvent =
  | { type: "progress"; progress: StatementImportProgress }
  | { type: "result"; result: ImportBankStatementSuccess }
  | { type: "error"; error: string; code?: string; status: number };

export type UploadBankStatementOptions = {
  onProgress?: (progress: StatementImportProgress) => void;
  signal?: AbortSignal;
  ocrMode?: OcrMode;
};

export function isUploadAbortError(error: unknown) {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

export async function uploadBankStatement(
  file: File,
  options?: UploadBankStatementOptions,
) {
  assertOnlineForWrite();
  const form = new FormData();
  form.append("file", file);

  options?.onProgress?.({
    step: "receive",
    ...STATEMENT_IMPORT_STEPS.receive,
  });

  const skipLocalOcr = isStatementTextSource(file.name, file.type);
  if (options?.ocrMode === "local" && !skipLocalOcr) {
    options.onProgress?.({
      step: "ocr",
      percent: STATEMENT_IMPORT_STEPS.ocr.percent,
      label: "Scanning pages on this device…",
    });
    const local = await ocrDocumentLocally(file, {
      signal: options.signal,
      onProgress: (progress) => {
        options.onProgress?.({
          step: "ocr",
          percent: STATEMENT_IMPORT_STEPS.ocr.percent,
          label: progress.label,
        });
      },
    });
    if (!local.markdown.trim()) {
      throw new Error("Local scan found no readable text. Try Server scan.");
    }
    form.append("ocrMarkdown", local.markdown);
    form.append("ocrPageCount", String(local.pageCount));
  }

  const response = await fetch("/api/statements/upload", {
    method: "POST",
    body: form,
    signal: options?.signal,
  });

  const contentType = response.headers.get("content-type") ?? "";

  // Auth / early JSON errors before the stream starts.
  if (!contentType.includes("ndjson")) {
    const payload = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(payload?.error || `Upload failed (${response.status})`);
  }

  if (!response.body) {
    throw new Error("Upload stream missing.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: ImportBankStatementSuccess | null = null;

  const onAbort = () => {
    void reader.cancel();
  };
  if (options?.signal) {
    if (options.signal.aborted) {
      await reader.cancel();
      throw new DOMException("Upload cancelled", "AbortError");
    }
    options.signal.addEventListener("abort", onAbort, { once: true });
  }

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let newline = buffer.indexOf("\n");
      while (newline >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf("\n");
        if (!line) continue;

        const event = JSON.parse(line) as StreamEvent;
        if (event.type === "progress") {
          options?.onProgress?.(event.progress);
          continue;
        }
        if (event.type === "error") {
          throw new Error(event.error || "Statement import failed");
        }
        if (event.type === "result") {
          result = event.result;
        }
      }
    }
  } finally {
    options?.signal?.removeEventListener("abort", onAbort);
  }

  if (options?.signal?.aborted) {
    throw new DOMException("Upload cancelled", "AbortError");
  }

  if (!result) {
    throw new Error("Upload finished with no result.");
  }

  return result;
}

export { formatImportProgress };
