"use client";

import {
  isImageFilename,
  isPdfFilename,
} from "@/domains/statements/domain/ocrDocumentTypes";

const MIN_PDF_TEXT_CHARS = 80;
const MAX_PAGES = 40;
const PDF_RENDER_SCALE = 2;

type OcrResult = {
  markdown: string;
  pageCount: number;
};

type TesseractWorker = {
  recognize: (image: File | HTMLCanvasElement | Blob) => Promise<{
    data: { text: string };
  }>;
  terminate: () => Promise<unknown>;
};

let workerPromise: Promise<TesseractWorker> | null = null;

function assertBrowser() {
  if (typeof window === "undefined") {
    throw new Error("Local scan only runs in the browser.");
  }
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new DOMException("Scan cancelled", "AbortError");
  }
}

function pagesToMarkdown(pages: string[]) {
  return pages
    .map((body, index) => `## Page ${index + 1}\n\n${body.trim()}`)
    .join("\n\n");
}

function pdfItemText(item: unknown) {
  if (typeof item !== "object" || item === null || !("str" in item)) return "";
  const str = (item as { str?: unknown }).str;
  return typeof str === "string" ? str : "";
}

async function getWorker(): Promise<TesseractWorker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker } = await import("tesseract.js");
      return createWorker(["eng", "fra"], 1, {
        workerPath:
          "https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/worker.min.js",
        corePath: "https://cdn.jsdelivr.net/npm/tesseract.js-core@7.0.0",
        langPath: "https://tessdata.projectnaptha.com/4.0.0",
      }) as Promise<TesseractWorker>;
    })();
  }
  try {
    return await workerPromise;
  } catch (error) {
    workerPromise = null;
    throw error;
  }
}

async function ensurePdfWorker() {
  const pdfjs = await import("pdfjs-dist");
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
  }
  return pdfjs;
}

async function renderPdfPage<
  TViewport extends { width: number; height: number },
>(page: {
  getViewport: (opts: { scale: number }) => TViewport;
  render: (opts: {
    canvasContext: CanvasRenderingContext2D;
    viewport: TViewport;
    canvas: HTMLCanvasElement;
  }) => { promise: Promise<unknown> };
}) {
  const viewport = page.getViewport({ scale: PDF_RENDER_SCALE });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const canvasContext = canvas.getContext("2d", { willReadFrequently: true });
  if (!canvasContext) {
    throw new Error("Could not scan on this device.");
  }
  await page.render({ canvasContext, viewport, canvas }).promise;
  return canvas;
}

async function ocrPdf(
  file: File,
  signal: AbortSignal | undefined,
  onProgress: ((label: string) => void) | undefined,
): Promise<OcrResult> {
  const pdfjs = await ensurePdfWorker();
  const data = new Uint8Array(await file.arrayBuffer());
  throwIfAborted(signal);
  const pdf = await pdfjs.getDocument({ data }).promise;
  const pageCount = Math.min(pdf.numPages, MAX_PAGES);
  const pages: string[] = [];
  let worker: TesseractWorker | null = null;

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    throwIfAborted(signal);
    onProgress?.(`Scanning page ${pageNumber} of ${pageCount} on this device…`);
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const embedded = textContent.items
      .map(pdfItemText)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    if (embedded.length >= MIN_PDF_TEXT_CHARS) {
      pages.push(embedded);
      continue;
    }

    worker ??= await getWorker();
    const canvas = await renderPdfPage(page);
    throwIfAborted(signal);
    const { data: result } = await worker.recognize(canvas);
    pages.push(result.text);
  }

  if (pdf.numPages > MAX_PAGES) {
    pages.push(
      `(Stopped after ${MAX_PAGES} pages. Use Server scan for longer statements.)`,
    );
  }

  return { markdown: pagesToMarkdown(pages), pageCount };
}

async function ocrImage(
  file: File,
  signal: AbortSignal | undefined,
  onProgress: ((label: string) => void) | undefined,
): Promise<OcrResult> {
  onProgress?.("Scanning photo on this device…");
  throwIfAborted(signal);
  const worker = await getWorker();
  throwIfAborted(signal);
  try {
    const { data } = await worker.recognize(file);
    return {
      markdown: pagesToMarkdown([data.text]),
      pageCount: 1,
    };
  } catch {
    throw new Error(
      "This photo format needs Server scan. Switch Document scan to Server on Profile.",
    );
  }
}

export type LocalOcrProgress = {
  label: string;
};

/** Tesseract.js in the browser. PDFs use embedded text when present. */
export async function ocrDocumentLocally(
  file: File,
  options?: {
    signal?: AbortSignal;
    onProgress?: (progress: LocalOcrProgress) => void;
  },
): Promise<OcrResult> {
  assertBrowser();
  options?.onProgress?.({ label: "Loading scanner on this device…" });

  const filename = file.name || "document";
  if (isPdfFilename(filename) || file.type === "application/pdf") {
    return ocrPdf(file, options?.signal, (label) =>
      options?.onProgress?.({ label }),
    );
  }

  if (isImageFilename(filename) || file.type.startsWith("image/")) {
    return ocrImage(file, options?.signal, (label) =>
      options?.onProgress?.({ label }),
    );
  }

  throw new Error("Only PDF or image files can be scanned on this device.");
}
