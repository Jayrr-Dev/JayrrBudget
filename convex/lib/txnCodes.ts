/**
 * One idea for "what kind of line is this?"
 * Replaces the old split: txnCode (purchase/payment/…) + kind (Fee/Subscription/…).
 */

export const TXN_CODES = [
  "purchase",
  "payment",
  "refund",
  "fee",
  "interest",
  "cash_advance",
  "transfer",
  "subscription",
  "statement",
  "other",
] as const;

export type TxnCode = (typeof TXN_CODES)[number];

const TXN_CODE_SET = new Set<string>(TXN_CODES);

/** Codes that power Analysis "Type" charts (not every purchase). */
export const DIMENSIONAL_TXN_CODES = new Set<TxnCode>([
  "fee",
  "interest",
  "cash_advance",
  "subscription",
  "statement",
]);

const GENERIC_CODES = new Set(["", "purchase", "other"]);

function norm(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

export function isTxnCode(value: string | null | undefined): value is TxnCode {
  return TXN_CODE_SET.has(norm(value));
}

export function formatTxnCodeLabel(code: string | null | undefined) {
  const n = norm(code);
  if (!n) return null;
  return n
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/** Map legacy kind chips (Fee, Fee; Subscription, …) to a txn code. */
export function txnCodeFromKind(kind: string | null | undefined): TxnCode | null {
  const raw = norm(kind);
  if (!raw) return null;
  const tokens = raw.split(/[;|,]/).map((t) => t.trim()).filter(Boolean);
  if (tokens.some((t) => t === "subscription" || t.includes("subscription"))) {
    return "subscription";
  }
  if (tokens.some((t) => t === "interest")) return "interest";
  if (tokens.some((t) => t === "statement")) return "statement";
  if (tokens.some((t) => t === "fee" || t.includes("fee"))) return "fee";
  if (tokens.some((t) => t === "cash_advance" || t === "cash advance")) {
    return "cash_advance";
  }
  return null;
}

/**
 * Fold kind into txnCode. Subscription wins over fee/purchase.
 * Keep structural codes (payment/transfer/refund) unless kind is subscription
 * on a generic/fee row, or kind upgrades a generic purchase.
 */
export function mergeKindIntoTxnCode(
  txnCode: string | null | undefined,
  kind: string | null | undefined,
): string | null {
  const code = norm(txnCode);
  const fromKind = txnCodeFromKind(kind);
  const base: string | null = code || null;

  if (!fromKind) return base;

  if (fromKind === "subscription") {
    if (!base || GENERIC_CODES.has(base) || base === "fee") {
      return "subscription";
    }
    // payment + subscription (PAD gym) → subscription
    if (base === "payment") return "subscription";
    return base;
  }

  if (!base || GENERIC_CODES.has(base)) {
    return fromKind;
  }

  // Already specific (fee/interest/…) and kind agrees or is weaker
  return base;
}

/** Analysis type chip labels from the unified code (any txn code). */
export function typeLabelsFromTxnCode(
  txnCode: string | null | undefined,
): string[] {
  const n = norm(txnCode);
  if (!n || !isTxnCode(n)) return [];
  const label = formatTxnCodeLabel(n);
  return label ? [label] : [];
}
