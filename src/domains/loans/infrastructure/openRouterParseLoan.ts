import { generateObjectWithFallback } from "@/shared/ai/openRouter";
import { loanDocumentFieldsSchema } from "@/domains/loans/domain/loanDocumentFields";

export { isOpenRouterConfigured } from "@/shared/ai/openRouter";

const LOAN_PARSE_RULES = [
  "Extract consumer loan / mortgage / auto / student / HELOC / personal loan terms from OCR.",
  "Prefer CURRENT remaining principal when both original amount and balance appear.",
  "annualRatePct is a percent number (7.99), never a fraction (0.0799).",
  "paymentCount = remaining scheduled payments from firstPaymentDate, not term length already elapsed.",
  "firstPaymentDate = next or first payment as YYYY-MM-DD. Never month-day text like 'Jul 24'.",
  "paymentFrequency: weekly, biweekly (every 2 weeks), semimonthly (1st/15th style), or monthly.",
  "loanType: auto, mortgage, student, personal, heloc, or other.",
  "rateType: fixed or variable (floating / prime-linked → variable).",
  "vehicleLabel: vehicle year/make/model, property address, school, or collateral note when present.",
  "txnDescriptionLookup: phrase from the bank transaction description that identifies PAD payments; not the merchant name.",
  "Skip ads, insurance upsells, and payment history tables unless they are the only source of terms.",
  "If a field is missing or ambiguous, return null for that field (do not invent).",
].join("\n");

/** Parse loan contract OCR into structured form fields. */
export async function parseLoanDocumentFields(
  ocrMarkdown: string,
  options?: { sourceHint?: string },
) {
  const hint = options?.sourceHint?.trim();
  const { object } = await generateObjectWithFallback({
    schema: loanDocumentFieldsSchema,
    logLabel: "loan-document-parse",
    temperature: 0,
    prompt: [
      "Extract structured loan terms from this Canadian loan / financing OCR.",
      LOAN_PARSE_RULES,
      hint ? `SOURCE HINT (filename): ${hint}` : "",
      "",
      ocrMarkdown.slice(0, 120_000),
    ]
      .filter(Boolean)
      .join("\n"),
  });
  return object;
}
