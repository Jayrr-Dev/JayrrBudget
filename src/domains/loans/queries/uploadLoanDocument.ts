import {
  formatLoanDocumentProgress,
  LOAN_DOCUMENT_STEPS,
  type LoanDocumentProgress,
} from "@/domains/loans/domain/loanDocumentProgress";
import type { ParseLoanDocumentSuccess } from "@/domains/loans/domain/loanDocumentResult";

type StreamEvent =
  | { type: "progress"; progress: LoanDocumentProgress }
  | { type: "result"; result: ParseLoanDocumentSuccess }
  | { type: "error"; error: string; code?: string; status: number };

export type UploadLoanDocumentOptions = {
  onProgress?: (progress: LoanDocumentProgress) => void;
  signal?: AbortSignal;
  persistMode?: "convex" | "vault";
};

export function isLoanUploadAbortError(error: unknown) {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

export async function uploadLoanDocument(
  file: File,
  options?: UploadLoanDocumentOptions,
) {
  const form = new FormData();
  form.append("file", file);
  if (options?.persistMode === "vault") form.append("persistMode", "vault");

  options?.onProgress?.({
    step: "receive",
    ...LOAN_DOCUMENT_STEPS.receive,
  });

  const response = await fetch("/api/loans/parse-document", {
    method: "POST",
    body: form,
    signal: options?.signal,
  });

  const contentType = response.headers.get("content-type") ?? "";

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
  let result: ParseLoanDocumentSuccess | null = null;

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
          throw new Error(event.error || "Loan document parse failed");
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

export { formatLoanDocumentProgress };
