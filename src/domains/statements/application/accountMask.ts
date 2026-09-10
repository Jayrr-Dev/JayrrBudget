import { normalizeStatementAccountType } from "@/domains/dashboard/domain/accountCategory";

const LAST4 = /^\d{4}$/;

function last4(digits: string): string | null {
  const cleaned = digits.replace(/\D/g, "");
  if (cleaned.length < 4) return null;
  return cleaned.slice(-4);
}

function firstLast4(text: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const captured = match[2] ?? match[1];
    const mask = last4(captured);
    if (mask && LAST4.test(mask)) return mask;
  }
  return null;
}

/**
 * Folder/filename hints like visa1654, loc52839, mastercard9559.
 * Last 4 of the product number, not a random digit run on the PDF.
 */
export function hintAccountMask(source: string | null | undefined): string | null {
  if (!source) return null;
  const text = source.toLowerCase().replace(/\\/g, "/");

  const product = firstLast4(text, [
    /\bvisa\s*[-_]?(\d{4})\b/,
    /\bmaster(?:card)?\s*[-_]?(\d{4})\b/,
    /\bloc\s*[-_]?(\d{4,})\b/,
    /\bchequ(?:e|ing|eing)\s*[-_]?(\d{4,})\b/,
  ]);
  if (product) return product;

  return null;
}

/** Pull last-4 from OCR. Cards: PAN / "ending in". Deposit: account number. */
export function extractAccountMaskFromOcr(
  ocr: string,
  accountType: string | null | undefined,
): string | null {
  if (!ocr.trim()) return null;
  const type = normalizeStatementAccountType(accountType);

  if (type === "credit") {
    return firstLast4(ocr, [
      /card\s*(?:number|no\.?|#)?[^\d]{0,48}(?:[xX*]{4}[\s-]*){3}(\d{4})/,
      /(?:visa|mastercard|master\s*card|amex)[^\d]{0,48}(?:ending|ends)\s*(?:in\s*)?(\d{4})/i,
      /(?:ending|ends)\s*(?:in\s*)?(\d{4})[^\n]{0,24}(?:visa|mastercard|master\s*card)/i,
      /(?:xxxx|\*{4}|•{4})[\s-]*(?:xxxx|\*{4}|•{4})[\s-]*(?:xxxx|\*{4}|•{4})[\s-]*(\d{4})/i,
      /\b(?:\d{4}[\s-]*){3}(\d{4})\b/,
    ]);
  }

  if (type === "lending") {
    return firstLast4(ocr, [
      /(?:line of credit|loc|account)\s*(?:number|no\.?|#)?[:\s]*([\d\s-]{5,})/i,
    ]);
  }

  return firstLast4(ocr, [
    /account\s*(?:number|no\.?|#)[:\s]*([\d\s-]{5,})/i,
    /(?:chequing|checking)\s*(?:account)?[^\d]{0,24}([\d\s-]{5,})/i,
  ]);
}

export function resolveAccountMask(params: {
  parsedMask: string | null | undefined;
  accountType: string | null | undefined;
  sourceHint?: string | null;
  ocrMarkdown?: string | null;
}): string | null {
  const hinted = hintAccountMask(params.sourceHint ?? "");
  if (hinted) return hinted;

  const fromOcr = extractAccountMaskFromOcr(
    params.ocrMarkdown ?? "",
    params.accountType,
  );
  if (fromOcr) return fromOcr;

  const parsed = last4(String(params.parsedMask ?? ""));
  return parsed;
}
