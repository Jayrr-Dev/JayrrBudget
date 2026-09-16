import { Mistral } from "@mistralai/mistralai";
import { emitAiUsage } from "@/shared/ai/aiUsageSink";
import {
  isImageFilename,
  isOcrDocumentFilename,
  ocrDocumentMime,
} from "@/domains/statements/domain/ocrDocumentTypes";
import { retryOn } from "@/shared/ai/errors";

export function isMistralConfigured() {
  return Boolean(process.env.MISTRAL_API_KEY);
}

export function getMistralClient() {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) {
    throw new Error("Missing MISTRAL_API_KEY. Add it to .env.local.");
  }
  return new Mistral({ apiKey });
}

export type OcrResult = {
  markdown: string;
  pageCount: number;
};

function pagesToMarkdown(pages: Array<{ markdown?: string | null }>) {
  return pages
    .map((page, index) => {
      const body = page.markdown?.trim() || "";
      return `## Page ${index + 1}\n\n${body}`;
    })
    .join("\n\n");
}

function assertReadableMarkdown(markdown: string) {
  if (!markdown.replace(/^## Page \d+\s*$/gim, "").trim()) {
    throw new Error("OCR returned no readable text from this document.");
  }
}

async function ocrViaFileUpload(params: {
  filename: string;
  bytes: Buffer;
}): Promise<OcrResult> {
  const client = getMistralClient();

  const uploaded = await client.files.upload({
    file: {
      fileName: params.filename,
      content: params.bytes,
    },
    purpose: "ocr",
  });

  try {
    const ocr = await client.ocr.process({
      model: "mistral-ocr-latest",
      document: {
        type: "file",
        fileId: uploaded.id,
      },
    });

    const pages = ocr.pages ?? [];
    const markdown = pagesToMarkdown(pages);
    assertReadableMarkdown(markdown);
    const pageCount = pages.length;
    await emitAiUsage({
      source: "mistral-ocr",
      modelId: "mistral-ocr-latest",
      billedTo: "platform",
      pages: pageCount,
    });

    return {
      markdown,
      pageCount,
    };
  } finally {
    try {
      await client.files.delete({ fileId: uploaded.id });
    } catch {
      // Best-effort cleanup of the temporary OCR upload.
    }
  }
}

/** Phone photos / scans: Mistral OCR image_url + base64 data URL. */
async function ocrViaImageDataUrl(params: {
  filename: string;
  bytes: Buffer;
  mime: string;
}): Promise<OcrResult> {
  const client = getMistralClient();
  const base64 = params.bytes.toString("base64");
  const dataUrl = `data:${params.mime};base64,${base64}`;

  const ocr = await client.ocr.process({
    model: "mistral-ocr-latest",
    document: {
      type: "image_url",
      imageUrl: dataUrl,
    },
  });

  const pages = ocr.pages ?? [];
  const markdown = pagesToMarkdown(pages);
  assertReadableMarkdown(markdown);

  const pageCount = Math.max(pages.length, 1);
  await emitAiUsage({
    source: "mistral-ocr",
    modelId: "mistral-ocr-latest",
    billedTo: "platform",
    pages: pageCount,
  });
  return {
    markdown,
    pageCount,
  };
}

async function ocrDocumentOnce(params: {
  filename: string;
  bytes: Buffer;
  mimeType?: string | null;
}): Promise<OcrResult> {
  if (!isOcrDocumentFilename(params.filename)) {
    throw new Error(
      "Unsupported file type. Use PDF or an image (PNG, JPG, WEBP, AVIF, HEIC).",
    );
  }

  const mime = ocrDocumentMime(params.filename, params.mimeType);
  if (isImageFilename(params.filename) || mime.startsWith("image/")) {
    return ocrViaImageDataUrl({
      filename: params.filename,
      bytes: params.bytes,
      mime: mime.startsWith("image/") ? mime : "image/jpeg",
    });
  }

  return ocrViaFileUpload(params);
}

/**
 * OCR a PDF or photo of a document with Mistral.
 * Images use image_url (phone pics); PDFs use file upload.
 */
export async function ocrDocument(params: {
  filename: string;
  bytes: Buffer;
  mimeType?: string | null;
}): Promise<OcrResult> {
  return retryOn(() => ocrDocumentOnce(params), {
    attempts: 2,
    delayMs: 500,
    shouldRetry: (error) =>
      !/unauthor|api key|invalid key|403|401|unsupported file type/i.test(
        error instanceof Error ? error.message : String(error),
      ),
  });
}

/** @deprecated Prefer ocrDocument — kept for call-site compatibility. */
export async function ocrPdf(params: {
  filename: string;
  bytes: Buffer;
  mimeType?: string | null;
}): Promise<OcrResult> {
  return ocrDocument(params);
}
