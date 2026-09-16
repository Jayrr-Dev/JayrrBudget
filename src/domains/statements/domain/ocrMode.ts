export const OCR_MODES = ["local", "server"] as const;

export type OcrMode = (typeof OCR_MODES)[number];

export const DEFAULT_OCR_MODE: OcrMode = "server";

export const MAX_CLIENT_OCR_MARKDOWN = 1_500_000;

export type ClientOcrPayload = {
  markdown: string;
  pageCount: number;
};

export function resolveOcrMode(value: unknown): OcrMode {
  return value === "local" ? "local" : "server";
}

export function parseClientOcrForm(form: FormData): ClientOcrPayload | null {
  const raw = form.get("ocrMarkdown");
  if (typeof raw !== "string") return null;
  if (raw.length > MAX_CLIENT_OCR_MARKDOWN) {
    throw new Error("Local scan text is too large. Try Server scan.");
  }
  const markdown = raw.trim();
  if (!markdown) return null;
  const parsed = Number(form.get("ocrPageCount"));
  const pageCount =
    Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : 1;
  return { markdown, pageCount };
}
