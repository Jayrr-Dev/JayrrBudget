import { Mistral } from "@mistralai/mistralai";
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

async function ocrPdfOnce(params: {
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
    const markdown = pages
      .map((page, index) => {
        const body = page.markdown?.trim() || "";
        return `## Page ${index + 1}\n\n${body}`;
      })
      .join("\n\n");

    if (!markdown.replace(/^## Page \d+\s*$/gim, "").trim()) {
      throw new Error("OCR returned no readable text from this PDF.");
    }

    return {
      markdown,
      pageCount: pages.length,
    };
  } finally {
    try {
      await client.files.delete({ fileId: uploaded.id });
    } catch {
      // Best-effort cleanup of the temporary OCR upload.
    }
  }
}

/** OCR a PDF with Mistral. One retry on flake / empty text. */
export async function ocrPdf(params: {
  filename: string;
  bytes: Buffer;
}): Promise<OcrResult> {
  return retryOn(() => ocrPdfOnce(params), {
    attempts: 2,
    delayMs: 500,
    shouldRetry: (error) =>
      !/unauthor|api key|invalid key|403|401/i.test(
        error instanceof Error ? error.message : String(error),
      ),
  });
}
