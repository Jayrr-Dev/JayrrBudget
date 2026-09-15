import type { ImportBankStatementSuccess } from "@/domains/statements/domain/importResult";

export type ToastTone = "success" | "warning" | "error";

export type ImportCopy = {
  tone: ToastTone;
  title: string;
  description?: string;
};

const OUTCOMES = {
  duplicate: (data: ImportBankStatementSuccess) =>
    data.institutionName
      ? `Already imported (${data.institutionName})`
      : "This PDF was already imported",
  alreadyPresent: (data: ImportBankStatementSuccess) =>
    `All ${data.updatedCount} transactions were already on the ledger`,
  imported: (data: ImportBankStatementSuccess) => {
    const bits = [`Added ${data.insertedCount} new`];
    if (data.updatedCount > 0) {
      bits.push(`${data.updatedCount} already present`);
    }
    const from = data.institutionName ? ` from ${data.institutionName}` : "";
    return `${bits.join(", ")}${from}`;
  },
} as const;

function outcomeKey(data: ImportBankStatementSuccess) {
  if (data.duplicateFile) return "duplicate" as const;
  if (data.insertedCount === 0 && data.updatedCount > 0) {
    return "alreadyPresent" as const;
  }
  return "imported" as const;
}

function extraLines(data: ImportBankStatementSuccess) {
  const lines: string[] = [];
  if (data.categorization) {
    const c = data.categorization;
    lines.push(`${c.cached} reused, ${c.ai} categorized, ${c.pending} pending.`);
    if (c.error) lines.push(c.error);
  }

  if (data.removedTwinCount > 0) {
    lines.push(`Removed ${data.removedTwinCount} duplicate twins.`);
  }

  if (data.pageCount > 0 && outcomeKey(data) === "imported") {
    lines.push(`${data.pageCount} pages.`);
  }

  if (data.balanceOk === true) {
    lines.push(
      `Balanced: ${data.openingBalance} + ${data.transactionSum} = ${data.closingBalance}.`,
    );
  } else if (data.balanceOk === false) {
    lines.push(`Balance mismatch (delta ${data.balanceDelta}).`);
  }

  return lines;
}

/** Declarative toast copy from a successful import payload. */
export function describeImportResult(
  data: ImportBankStatementSuccess,
): ImportCopy {
  const title = OUTCOMES[outcomeKey(data)](data);
  const description = extraLines(data).join(" ") || undefined;
  const tone: ToastTone = data.balanceOk === false || data.categorization?.ok === false ? "warning" : "success";

  return { tone, title, description };
}
