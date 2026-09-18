import type { PrivateLedger } from "@/domains/vault/domain/privateLedger";

export type BankLineMerchantRename = {
  canonicalName: string;
  merchantIds: string[];
};

/**
 * Lines the bank charges or pays itself: no payee in the text, so the
 * "merchant" is the institution that issued the statement.
 */
const BANK_LINE_RE =
  /\b(?:fee|fees|service charge|interest|overdraft|nsf|monthly plan|account plan|paper statement|plan fee)\b/i;

/** Institution text as parsed from statements → short display name. */
const BANK_SHORT_NAMES: Array<[RegExp, string]> = [
  [/\bcibc\b|canadian imperial/i, "CIBC"],
  [/\btd\b|toronto[-\s]?dominion/i, "TD"],
  [/\brbc\b|royal bank/i, "RBC"],
  [/\bbmo\b|bank of montreal/i, "BMO"],
  [/scotia/i, "Scotiabank"],
  [/national bank|banque nationale/i, "National Bank"],
  [/\batb\b/i, "ATB"],
  [/servus/i, "Servus"],
  [/tangerine/i, "Tangerine"],
  [/simplii/i, "Simplii"],
  [/\beq bank\b/i, "EQ Bank"],
  [/desjardins/i, "Desjardins"],
  [/\bhsbc\b/i, "HSBC"],
  [/wealthsimple/i, "Wealthsimple"],
  [/\bkoho\b/i, "KOHO"],
  [/\bneo\b/i, "Neo"],
  [/\bmbna\b/i, "MBNA"],
  [/\bamex\b|american express/i, "Amex"],
  [/\bpc financial\b|president'?s choice/i, "PC Financial"],
];

export function shortBankName(text: string | null | undefined): string | null {
  if (!text) return null;
  for (const [pattern, name] of BANK_SHORT_NAMES) {
    if (pattern.test(text)) return name;
  }
  return null;
}

function txnLabel(tx: {
  merchantClean?: string | null;
  merchantName?: string | null;
}) {
  return (tx.merchantClean ?? tx.merchantName ?? "").trim().toLowerCase();
}

/**
 * "Monthly Plan Fee" → "CIBC Monthly Plan Fee" when every linked transaction
 * came from one institution. Ambiguous or unknown banks leave the name alone.
 */
export function planBankLineMerchantNames(
  ledger: Pick<
    PrivateLedger,
    "merchants" | "transactions" | "statementLogs" | "accounts"
  >,
): BankLineMerchantRename[] {
  const bankByStatement = new Map<string, string | null>();
  for (const log of ledger.statementLogs) {
    bankByStatement.set(log.recordId, shortBankName(log.institutionName));
  }
  const bankByAccount = new Map<string, string | null>();
  for (const account of ledger.accounts) {
    bankByAccount.set(
      account.accountId,
      shortBankName(account.officialName) ??
        shortBankName(account.name) ??
        shortBankName(account.accountId),
    );
  }

  const banksByLabel = new Map<string, Set<string | null>>();
  for (const tx of ledger.transactions) {
    const label = txnLabel(tx);
    if (!label) continue;
    const bank =
      (tx.statementRecordId
        ? bankByStatement.get(tx.statementRecordId)
        : null) ??
      (tx.accountId ? bankByAccount.get(tx.accountId) : null) ??
      null;
    const set = banksByLabel.get(label) ?? new Set<string | null>();
    set.add(bank);
    banksByLabel.set(label, set);
  }

  const byCanonical = new Map<string, Set<string>>();
  const merchantIdsByName = new Map<string, string>();
  for (const merchant of ledger.merchants) {
    merchantIdsByName.set(merchant.name.trim().toLowerCase(), merchant.recordId);
  }

  for (const merchant of ledger.merchants) {
    const name = merchant.name.trim();
    if (!BANK_LINE_RE.test(name)) continue;
    if (shortBankName(name)) continue; // already says which bank
    const banks = banksByLabel.get(name.toLowerCase());
    if (!banks || banks.size !== 1) continue;
    const [bank] = [...banks];
    if (!bank) continue;
    const canonicalName = `${bank} ${name}`;
    const ids = byCanonical.get(canonicalName) ?? new Set<string>();
    ids.add(merchant.recordId);
    const existing = merchantIdsByName.get(canonicalName.toLowerCase());
    if (existing) ids.add(existing);
    byCanonical.set(canonicalName, ids);
  }

  return [...byCanonical.entries()].map(([canonicalName, ids]) => ({
    canonicalName,
    merchantIds: [...ids],
  }));
}
