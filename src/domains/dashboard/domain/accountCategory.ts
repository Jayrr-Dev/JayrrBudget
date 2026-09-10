import type { DashboardAccount } from "@/domains/dashboard/domain/types";

/** Dashboard grouping for bank-style sections. */
export type AccountCategory =
  | "chequing"
  | "savings"
  | "other"
  | "credit_card"
  | "lending";

export type AccountSectionId = "deposit" | "credit" | "lending";

export type CardNetwork = "visa" | "mastercard" | "amex" | "unknown";

/** Gemini / statement parse account types (includes aliases). */
export const STATEMENT_ACCOUNT_TYPES = [
  "chequing",
  "checking",
  "savings",
  "credit",
  "credit_card",
  "lending",
  "line_of_credit",
  "other",
] as const;

export type StatementAccountType = (typeof STATEMENT_ACCOUNT_TYPES)[number];

export function normalizeStatementAccountType(
  value: string | null | undefined,
): Exclude<StatementAccountType, "checking" | "credit_card" | "line_of_credit"> {
  const raw = (value ?? "other").toLowerCase().trim().replace(/[\s-]+/g, "_");

  if (raw === "checking" || raw === "chequing" || raw === "current") {
    return "chequing";
  }
  if (raw === "savings" || raw === "tfsa" || raw === "rrsp") {
    return "savings";
  }
  if (
    raw === "credit" ||
    raw === "credit_card" ||
    raw === "creditcard" ||
    raw === "visa" ||
    raw === "mastercard"
  ) {
    return "credit";
  }
  if (
    raw === "lending" ||
    raw === "line_of_credit" ||
    raw === "loc" ||
    raw === "loan" ||
    raw === "mortgage" ||
    raw === "heloc"
  ) {
    return "lending";
  }
  return "other";
}

/** Map statement account type → Plaid-like type/subtype stored on accounts. */
export function statementTypeToLedgerFields(accountType: string): {
  type: string;
  subtype: string | null;
} {
  const normalized = normalizeStatementAccountType(accountType);
  switch (normalized) {
    case "chequing":
      return { type: "depository", subtype: "checking" };
    case "savings":
      return { type: "depository", subtype: "savings" };
    case "credit":
      return { type: "credit", subtype: "credit card" };
    case "lending":
      return { type: "loan", subtype: "line of credit" };
    default:
      return { type: "depository", subtype: "other" };
  }
}

function includesAny(haystack: string, needles: string[]) {
  return needles.some((needle) => haystack.includes(needle));
}

/** Infer dashboard category from stored type/subtype/name (existing + new rows). */
export function resolveAccountCategory(
  account: Pick<DashboardAccount, "name" | "officialName" | "type" | "subtype">,
): AccountCategory {
  const type = (account.type ?? "").toLowerCase();
  const subtype = (account.subtype ?? "").toLowerCase();
  const label = `${account.name} ${account.officialName ?? ""}`.toLowerCase();

  if (
    type === "loan" ||
    type === "mortgage" ||
    subtype.includes("line of credit") ||
    subtype.includes("loan") ||
    subtype.includes("mortgage") ||
    includesAny(label, [
      "line of credit",
      "heloc",
      "home equity",
      "personal loan",
      "mortgage",
    ])
  ) {
    return "lending";
  }

  if (
    type === "credit" ||
    subtype.includes("credit") ||
    includesAny(label, ["visa", "mastercard", "master card", "amex", "american express"])
  ) {
    return "credit_card";
  }

  if (
    subtype === "checking" ||
    subtype === "chequing" ||
    includesAny(label, ["chequing", "checking"])
  ) {
    return "chequing";
  }

  if (subtype === "savings" || includesAny(label, ["savings"])) {
    return "savings";
  }

  if (type === "depository" || type === "brokerage" || type === "investment") {
    if (subtype === "other" || !subtype) return "other";
    return "other";
  }

  return "other";
}

export function sectionForCategory(category: AccountCategory): AccountSectionId {
  if (category === "credit_card") return "credit";
  if (category === "lending") return "lending";
  return "deposit";
}

export const ACCOUNT_SECTION_LABELS: Record<AccountSectionId, string> = {
  deposit: "Deposit accounts",
  credit: "Credit cards",
  lending: "Lending accounts",
};

/** Debit badge on chequing + other deposit products (bank UI pattern). */
export function showDebitBadge(category: AccountCategory) {
  return category === "chequing" || category === "other";
}

export function detectCardNetwork(
  account: Pick<DashboardAccount, "name" | "officialName">,
): CardNetwork {
  const label = `${account.name} ${account.officialName ?? ""}`.toLowerCase();
  if (label.includes("visa")) return "visa";
  if (label.includes("mastercard") || label.includes("master card")) {
    return "mastercard";
  }
  if (label.includes("amex") || label.includes("american express")) {
    return "amex";
  }
  return "unknown";
}

export function formatAccountNumber(
  account: Pick<DashboardAccount, "mask" | "type" | "subtype">,
  category: AccountCategory,
) {
  const digits = String(account.mask ?? "").replace(/\D/g, "");
  if (!digits) return "••••";

  if (category === "credit_card") {
    const last4 = digits.slice(-4).padStart(4, "0");
    return `•••• ${last4}`;
  }

  if (digits.length >= 8) {
    return digits.replace(/(\d{4})(?=\d)/g, "$1-");
  }

  return `•••• ${digits.slice(-4)}`;
}

/** Credit cards: show liability with leading minus when balance owed is positive. */
export function displayBalanceAmount(
  balance: number | null | undefined,
  category: AccountCategory,
) {
  if (balance == null || Number.isNaN(balance)) return null;
  if (category === "credit_card" && balance > 0) return -balance;
  return balance;
}

export function groupAccountsBySection(accounts: DashboardAccount[]) {
  const sections: Record<AccountSectionId, DashboardAccount[]> = {
    deposit: [],
    credit: [],
    lending: [],
  };

  const depositOrder: AccountCategory[] = ["chequing", "savings", "other"];

  for (const account of accounts) {
    const category = resolveAccountCategory(account);
    sections[sectionForCategory(category)].push(account);
  }

  sections.deposit.sort((a, b) => {
    const ai = depositOrder.indexOf(resolveAccountCategory(a));
    const bi = depositOrder.indexOf(resolveAccountCategory(b));
    return ai - bi;
  });

  return (["deposit", "credit", "lending"] as const)
    .map((id) => ({
      id,
      label: ACCOUNT_SECTION_LABELS[id],
      accounts: sections[id],
    }))
    .filter((section) => section.accounts.length > 0);
}
