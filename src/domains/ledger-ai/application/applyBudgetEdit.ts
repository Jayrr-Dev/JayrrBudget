import type {
  ApplyBudgetEditInput,
  ApplyBudgetEditOutput,
} from "@/domains/ledger-ai/domain/applyBudgetEditTool";
import {
  patchEncryptedTransaction,
  type VaultWriteContext,
} from "@/domains/vault/application/saveEncryptedLedger";
import type { PrivateTransaction } from "@/domains/vault/domain/privateLedger";

const AMOUNT_TOLERANCE = 0.005;
const DATE_WINDOW_DAYS = 3;

function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function sameAmount(a: number, b: number) {
  return Math.abs(Math.abs(a) - Math.abs(b)) < AMOUNT_TOLERANCE;
}

function haystack(row: {
  description: string;
  merchantName?: string | null;
  merchantClean?: string | null;
}) {
  return [row.description, row.merchantName, row.merchantClean]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function inDateWindow(posted: string, start?: string, end?: string) {
  if (start && posted < start) return false;
  if (end && posted > end) return false;
  return true;
}

function filterVaultRows(
  rows: PrivateTransaction[],
  startDate: string | undefined,
  endDate: string | undefined,
  query: string | undefined,
  amount: number | undefined,
  account: string | undefined,
) {
  const q = query?.trim().toLowerCase();
  const accountKey = account?.trim().toLowerCase();
  return rows.filter((row) => {
    if (!inDateWindow(row.date, startDate, endDate)) return false;
    if (amount !== undefined && !sameAmount(row.amount, amount)) return false;
    if (accountKey) {
      const id = (row.accountId ?? "").toLowerCase();
      if (!id.includes(accountKey) && !id.endsWith(accountKey)) return false;
    }
    if (q && !haystack(row).includes(q)) return false;
    return true;
  });
}

function pickVaultMatch(
  rows: PrivateTransaction[],
  input: ApplyBudgetEditInput,
):
  | { tx: PrivateTransaction }
  | { error: string; candidates?: ApplyBudgetEditOutput["candidates"] } {
  if (input.transactionId?.trim()) {
    const tx = rows.find((row) => row.recordId === input.transactionId?.trim());
    if (!tx) return { error: "Transaction not found in the unlocked vault." };
    return { tx };
  }
  const date = input.date?.trim();
  const query = input.query?.trim() || undefined;
  if (!date && input.amount === undefined && !query) {
    return {
      error: "Pass date, amount, and/or query from the row the user named.",
    };
  }
  const attempts: Array<{ start?: string; end?: string; query?: string }> = [];
  if (date) {
    attempts.push({ start: date, end: date, query });
    const wide = {
      start: shiftDate(date, -DATE_WINDOW_DAYS),
      end: shiftDate(date, DATE_WINDOW_DAYS),
    };
    attempts.push({ ...wide, query });
    if (query) attempts.push(wide);
  } else {
    attempts.push({ query });
  }
  let hits: PrivateTransaction[] = [];
  for (const attempt of attempts) {
    hits = filterVaultRows(
      rows,
      attempt.start,
      attempt.end,
      attempt.query,
      input.amount,
      input.account,
    );
    if (hits.length > 0) break;
  }
  if (hits.length === 1) return { tx: hits[0]! };
  if (hits.length === 0) {
    return { error: "No transaction matched that date, amount, and text." };
  }
  return {
    error: `${hits.length} transactions matched. Call again with the exact date and amount the user showed; if these are the same purchase repeated, take the first. Ask the user only if they truly differ.`,
    candidates: hits.slice(0, 10).map((row) => ({
      date: row.date,
      description: row.description,
      amount: row.amount,
    })),
  };
}

function vaultPatch(input: ApplyBudgetEditInput) {
  const patch: Partial<Omit<PrivateTransaction, "recordId" | "revision">> = {};
  if (input.description !== undefined) patch.description = input.description;
  if (input.section !== undefined) patch.sectionName = input.section;
  if (input.category !== undefined) patch.categoryName = input.category;
  if (input.subcategory !== undefined)
    patch.subcategoryName = input.subcategory;
  if (input.spread !== undefined) patch.spreadName = input.spread;
  if (input.merchant !== undefined) {
    patch.merchantClean = input.merchant;
    patch.merchantName = input.merchant;
  }
  if (input.addTags || input.removeTags) {
    // Tags applied after we know the current row.
  }
  return patch;
}

export async function applyBudgetEdit(options: {
  input: ApplyBudgetEditInput;
  transactions: PrivateTransaction[];
  vaultWrite: VaultWriteContext | null;
  onVaultSaved?: () => void;
}): Promise<ApplyBudgetEditOutput> {
  const { input } = options;
  if (!options.vaultWrite) {
    return { ok: false, error: "Unlock your private ledger to edit." };
  }
  const found = pickVaultMatch(options.transactions, input);
  if ("error" in found) {
    return { ok: false, error: found.error, candidates: found.candidates };
  }
  const patch = vaultPatch(input);
  if (input.addTags || input.removeTags) {
    const tags = new Set(found.tx.tagNames ?? []);
    for (const tag of input.removeTags ?? []) tags.delete(tag);
    for (const tag of input.addTags ?? []) {
      const name = tag.trim();
      if (name) tags.add(name);
    }
    patch.tagNames = [...tags];
  }
  if (Object.keys(patch).length === 0) {
    return {
      ok: false,
      error: "Nothing to change. Pass category, subcategory, or another field.",
    };
  }
  const next = await patchEncryptedTransaction(
    options.vaultWrite,
    found.tx,
    patch,
  );
  options.onVaultSaved?.();
  return {
    ok: true,
    transactionId: next.recordId,
    date: next.date,
    description: next.description,
    amount: next.amount,
    section: next.sectionName ?? null,
    category: next.categoryName ?? null,
    subcategory: next.subcategoryName ?? null,
  };
}
