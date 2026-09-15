export type LedgerLineInput = {
  externalId: string;
  accountId: string;
  description: string;
  pending: boolean;
  source?: string;
  statementUploadId: number | null;
  amount: number;
  currencyCode: string;
  runningBalance?: number | null;
  postedDate: string;
  authorizedDate?: string | null;
  locationCity?: string | null;
  locationRegion?: string | null;
  locationCountry?: string | null;
  checkNumber?: string | null;
  referenceNumber?: string | null;
  transactionCode?: string | null;
  paymentChannel?: string | null;
  foreignAmount?: number | null;
  foreignCurrency?: string | null;
  /** Parse-time cleaned merchant; seeds enrichment without full AI pass. */
  merchantClean?: string | null;
  section?: string | null;
  category?: string | null;
  subcategory?: string | null;
};

const RETIRED =
  "Retired: flat transactions schema. Re-import CSV via scripts/rebuild-flat-transactions.ts";

export async function insertLedgerLine(_line: LedgerLineInput): Promise<number> {
  throw new Error(RETIRED);
}

export async function updateLedgerLine(
  _transactionPk: number,
  _line: LedgerLineInput,
): Promise<void> {
  throw new Error(RETIRED);
}
