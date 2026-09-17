import {
  deletePrivateRecords,
  type MutationClient,
} from "@/crypto/vaultRecords";
import type {
  CreateTransactionInput,
  CreateTransactionOutput,
  DeleteTransactionsInput,
  DeleteTransactionsOutput,
  RecategorizeMatchingInput,
  RecategorizeMatchingOutput,
  RenameDescriptionsInput,
  RenameDescriptionsOutput,
  UpdateTransactionInput,
  UpdateTransactionOutput,
  UpdateTransactionsInput,
} from "@/domains/ledger-ai/domain/vaultLedgerWriteTools";
import type {
  PrivateAccount,
  PrivateTransaction,
} from "@/domains/vault/domain/privateLedger";
import {
  patchEncryptedTransaction,
  renameEncryptedDescriptions,
  saveEncryptedRecords,
  type VaultWriteContext,
} from "@/domains/vault/application/saveEncryptedLedger";
import { errorMessage } from "@/shared/lib/error-message";

const AMOUNT_TOLERANCE = 0.005;
const DATE_WINDOW_DAYS = 3;
const MAX_BULK = 100;

function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function sameAmount(a: number, b: number) {
  return Math.abs(Math.abs(a) - Math.abs(b)) < AMOUNT_TOLERANCE;
}

function sameName(a: string | null | undefined, b: string) {
  return (a ?? "").trim().toLowerCase() === b.trim().toLowerCase();
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

function resolveAccount(
  accounts: PrivateAccount[],
  needle: string,
): PrivateAccount | null {
  const key = needle.trim().toLowerCase();
  if (!key) return null;
  const exact = accounts.find(
    (account) =>
      sameName(account.accountId, key) ||
      sameName(account.name, key) ||
      sameName(account.officialName, key),
  );
  if (exact) return exact;
  const digits = key.replace(/\D/g, "");
  if (digits.length >= 4) {
    const byMask = accounts.find((account) =>
      (account.mask ?? "").endsWith(digits.slice(-4)),
    );
    if (byMask) return byMask;
  }
  return (
    accounts.find(
      (account) =>
        account.accountId.toLowerCase().includes(key) ||
        account.name.toLowerCase().includes(key),
    ) ?? null
  );
}

function pickMatch(
  rows: PrivateTransaction[],
  input: {
    transactionId?: string;
    match?: {
      date?: string;
      amount?: number;
      query?: string;
      account?: string;
    };
  },
):
  | { tx: PrivateTransaction }
  | {
      error: string;
      candidates?: UpdateTransactionOutput["candidates"];
    } {
  if (input.transactionId?.trim()) {
    const tx = rows.find((row) => row.recordId === input.transactionId?.trim());
    if (!tx) return { error: "Transaction not found in the unlocked vault." };
    return { tx };
  }
  const match = input.match ?? {};
  const date = match.date?.trim();
  const query = match.query?.trim() || undefined;
  if (!date && match.amount === undefined && !query) {
    return {
      error: "Pass transactionId, or match with date, amount, and/or query.",
    };
  }
  const accountKey = match.account?.trim().toLowerCase();
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
    hits = rows.filter((row) => {
      if (attempt.start && row.date < attempt.start) return false;
      if (attempt.end && row.date > attempt.end) return false;
      if (match.amount !== undefined && !sameAmount(row.amount, match.amount)) {
        return false;
      }
      if (accountKey) {
        const id = (row.accountId ?? "").toLowerCase();
        if (!id.includes(accountKey) && !id.endsWith(accountKey)) return false;
      }
      if (attempt.query && !haystack(row).includes(attempt.query.toLowerCase())) {
        return false;
      }
      return true;
    });
    if (hits.length > 0) break;
  }
  if (hits.length === 1) return { tx: hits[0]! };
  if (hits.length === 0) {
    return { error: "No transaction matched that date, amount, and text." };
  }
  return {
    error: `${hits.length} transactions matched. Ask the user which one.`,
    candidates: hits.slice(0, 10).map((row) => ({
      date: row.date,
      description: row.description,
      amount: row.amount,
      transactionId: row.recordId,
    })),
  };
}

function patchFromInput(input: {
  description?: string;
  date?: string;
  amount?: number;
  pending?: boolean;
  section?: string | null;
  category?: string | null;
  subcategory?: string | null;
  spread?: string | null;
  merchant?: string | null;
  addTags?: string[];
  removeTags?: string[];
}): Partial<Omit<PrivateTransaction, "recordId" | "revision">> {
  const patch: Partial<Omit<PrivateTransaction, "recordId" | "revision">> = {};
  if (input.description !== undefined) patch.description = input.description;
  if (input.date !== undefined) patch.date = input.date;
  if (input.amount !== undefined) patch.amount = input.amount;
  if (input.pending !== undefined) patch.pending = input.pending;
  if (input.section !== undefined) patch.sectionName = input.section;
  if (input.category !== undefined) patch.categoryName = input.category;
  if (input.subcategory !== undefined) patch.subcategoryName = input.subcategory;
  if (input.spread !== undefined) patch.spreadName = input.spread;
  if (input.merchant !== undefined) {
    patch.merchantClean = input.merchant;
    patch.merchantName = input.merchant;
  }
  return patch;
}

function applyTags(
  tx: PrivateTransaction,
  addTags?: string[],
  removeTags?: string[],
) {
  if (!addTags && !removeTags) return undefined;
  const tags = new Set(tx.tagNames ?? []);
  for (const tag of removeTags ?? []) tags.delete(tag);
  for (const tag of addTags ?? []) {
    const name = tag.trim();
    if (name) tags.add(name);
  }
  return [...tags];
}

export async function createVaultTransaction(options: {
  input: CreateTransactionInput;
  accounts: PrivateAccount[];
  vaultWrite: VaultWriteContext;
}): Promise<CreateTransactionOutput> {
  try {
    const account = resolveAccount(options.accounts, options.input.account);
    if (!account) {
      return {
        ok: false,
        error: `Account not found: ${options.input.account}. Use an account name from the budget snapshot.`,
      };
    }
    const recordId = `manual-${crypto.randomUUID()}`;
    await saveEncryptedRecords(options.vaultWrite, [
      {
        recordId,
        kind: "tx",
        value: {
          date: options.input.date,
          authorizedDate: null,
          description: options.input.description.trim(),
          amount: options.input.amount,
          currency: options.input.currency?.trim() || "CAD",
          foreignAmount: null,
          foreignCurrency: null,
          exchangeRate: null,
          accountId: account.accountId,
          pending: false,
          city: null,
          region: null,
          country: null,
          merchantName: options.input.merchant ?? null,
          merchantClean: options.input.merchant ?? null,
          sectionName: options.input.section ?? null,
          categoryName: options.input.category ?? null,
          subcategoryName: options.input.subcategory ?? null,
          spreadName: null,
          transactionTypeName: null,
          txnCode: null,
          channel: null,
          statementRecordId: null,
          source: "manual",
          tagNames: options.input.tags ?? [],
        },
        expectedRevision: null,
      },
    ]);
    return {
      ok: true,
      transactionId: recordId,
      date: options.input.date,
      description: options.input.description.trim(),
      amount: options.input.amount,
    };
  } catch (error) {
    return {
      ok: false,
      error: errorMessage(error, "Could not create the transaction"),
    };
  }
}

export async function updateVaultTransaction(options: {
  input: UpdateTransactionInput;
  transactions: PrivateTransaction[];
  vaultWrite: VaultWriteContext;
}): Promise<UpdateTransactionOutput> {
  try {
    const found = pickMatch(options.transactions, options.input);
    if ("error" in found) {
      return { ok: false, error: found.error, candidates: found.candidates };
    }
    const patch = patchFromInput(options.input);
    const tags = applyTags(
      found.tx,
      options.input.addTags,
      options.input.removeTags,
    );
    if (tags) patch.tagNames = tags;
    if (Object.keys(patch).length === 0) {
      return {
        ok: false,
        error: "Nothing to change. Pass at least one field to update.",
      };
    }
    const next = await patchEncryptedTransaction(
      options.vaultWrite,
      found.tx,
      patch,
    );
    return {
      ok: true,
      transactionId: next.recordId,
      date: next.date,
      description: next.description,
      amount: next.amount,
      section: next.sectionName ?? null,
      category: next.categoryName ?? null,
      subcategory: next.subcategoryName ?? null,
      updatedCount: 1,
    };
  } catch (error) {
    return {
      ok: false,
      error: errorMessage(error, "Could not update the transaction"),
    };
  }
}

export async function updateVaultTransactions(options: {
  input: UpdateTransactionsInput;
  transactions: PrivateTransaction[];
  vaultWrite: VaultWriteContext;
}): Promise<UpdateTransactionOutput> {
  try {
    const ids = options.input.transactionIds.slice(0, MAX_BULK);
    const patch = patchFromInput(options.input);
    let updated = 0;
    for (const id of ids) {
      const tx = options.transactions.find((row) => row.recordId === id);
      if (!tx) continue;
      const nextPatch = { ...patch };
      const tags = applyTags(tx, options.input.addTags, options.input.removeTags);
      if (tags) nextPatch.tagNames = tags;
      if (Object.keys(nextPatch).length === 0) continue;
      await patchEncryptedTransaction(options.vaultWrite, tx, nextPatch);
      updated += 1;
    }
    if (updated === 0) {
      return { ok: false, error: "No matching vault transactions to update." };
    }
    return { ok: true, updatedCount: updated };
  } catch (error) {
    return {
      ok: false,
      error: errorMessage(error, "Could not update those transactions"),
    };
  }
}

export async function deleteVaultTransactions(options: {
  input: DeleteTransactionsInput;
  vaultWrite: VaultWriteContext;
}): Promise<DeleteTransactionsOutput> {
  if (!options.input.confirmed) {
    return {
      ok: false,
      error:
        "Not deleted. Ask the user to confirm, then call again with confirmed: true.",
    };
  }
  try {
    const result = await deletePrivateRecords(
      options.vaultWrite.client as unknown as MutationClient,
      {
        vaultId: options.vaultWrite.vaultId,
        recordIds: options.input.transactionIds,
      },
    );
    return { ok: true, removed: result.removed };
  } catch (error) {
    return {
      ok: false,
      error: errorMessage(error, "Could not delete those transactions"),
    };
  }
}

export async function renameVaultDescriptions(options: {
  input: RenameDescriptionsInput;
  transactions: PrivateTransaction[];
  vaultWrite: VaultWriteContext;
}): Promise<RenameDescriptionsOutput> {
  try {
    const taxonomy =
      options.input.section !== undefined ||
      options.input.category !== undefined ||
      options.input.subcategory !== undefined
        ? {
            sectionName: options.input.section ?? null,
            categoryName: options.input.category ?? null,
            subcategoryName: options.input.subcategory ?? null,
          }
        : undefined;
    const renamed = await renameEncryptedDescriptions(
      options.vaultWrite,
      options.transactions,
      options.input.from,
      options.input.to,
      taxonomy,
    );
    return { ok: true, renamed };
  } catch (error) {
    return {
      ok: false,
      error: errorMessage(error, "Could not rename those descriptions"),
    };
  }
}

export async function recategorizeVaultMatching(options: {
  input: RecategorizeMatchingInput;
  transactions: PrivateTransaction[];
  vaultWrite: VaultWriteContext;
}): Promise<RecategorizeMatchingOutput> {
  try {
    if (!options.input.merchant?.trim() && !options.input.query?.trim()) {
      return {
        ok: false,
        error:
          "Provide merchant or query so this does not recategorize unrelated rows.",
      };
    }
    if (
      options.input.section === undefined &&
      options.input.category === undefined &&
      options.input.subcategory === undefined
    ) {
      return {
        ok: false,
        error: "Provide at least one of section, category, subcategory.",
      };
    }
    const merchant = options.input.merchant?.trim().toLowerCase();
    const query = options.input.query?.trim().toLowerCase();
    const matches = options.transactions
      .filter((row) => {
        if (options.input.startDate && row.date < options.input.startDate) {
          return false;
        }
        if (options.input.endDate && row.date > options.input.endDate) {
          return false;
        }
        if (merchant) {
          const label = (
            row.merchantClean ??
            row.merchantName ??
            ""
          ).toLowerCase();
          if (!label.includes(merchant) && !haystack(row).includes(merchant)) {
            return false;
          }
        }
        if (query && !haystack(row).includes(query)) return false;
        return true;
      })
      .slice(0, MAX_BULK);

    const preview = matches.map((row) => ({
      transactionId: row.recordId,
      date: row.date,
      description: row.description,
      amount: row.amount,
    }));

    if (options.input.dryRun || matches.length === 0) {
      return {
        ok: true,
        dryRun: true,
        wouldUpdate: matches.length,
        matches: preview,
      };
    }

    const patch = patchFromInput({
      section: options.input.section,
      category: options.input.category,
      subcategory: options.input.subcategory,
    });
    for (const tx of matches) {
      await patchEncryptedTransaction(options.vaultWrite, tx, patch);
    }
    return {
      ok: true,
      updatedCount: matches.length,
      matches: preview,
    };
  } catch (error) {
    return {
      ok: false,
      error: errorMessage(error, "Could not recategorize matching rows"),
    };
  }
}
