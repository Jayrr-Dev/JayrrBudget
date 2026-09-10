import type { Transaction } from "plaid";

export type TransactionRow = {
  plaidTransactionId: string;
  accountId: string;
  itemId: string;
  name: string;
  merchantName: string | null;
  merchantEntityId: string | null;
  merchantCategoryCode: string | null;
  originalDescription: string | null;
  amount: number;
  isoCurrencyCode: string | null;
  date: string;
  datetime: string | null;
  authorizedDate: string | null;
  authorizedDatetime: string | null;
  pending: boolean;
  pendingTransactionId: string | null;
  categoryPrimary: string | null;
  categoryDetailed: string | null;
  categoryConfidence: string | null;
  paymentChannel: string | null;
  transactionCode: string | null;
  checkNumber: string | null;
  accountOwner: string | null;
  website: string | null;
  logoUrl: string | null;
  categoryIconUrl: string | null;
  locationCity: string | null;
  locationRegion: string | null;
  locationPostalCode: string | null;
  locationCountry: string | null;
  locationLat: number | null;
  locationLon: number | null;
  locationAddress: string | null;
  locationStoreNumber: string | null;
  counterpartiesJson: string | null;
  paymentMetaJson: string | null;
  runningBalance: number | null;
  updatedAt: Date;
};

export function mapPlaidTransaction(
  txn: Transaction,
  itemId: string,
): TransactionRow {
  return {
    plaidTransactionId: txn.transaction_id,
    accountId: txn.account_id,
    itemId,
    name: txn.name,
    merchantName: txn.merchant_name ?? null,
    merchantEntityId: txn.merchant_entity_id ?? null,
    merchantCategoryCode: txn.merchant_category_code ?? null,
    originalDescription: txn.original_description ?? null,
    amount: txn.amount,
    isoCurrencyCode: txn.iso_currency_code ?? "USD",
    date: txn.date,
    datetime: txn.datetime ?? null,
    authorizedDate: txn.authorized_date ?? null,
    authorizedDatetime: txn.authorized_datetime ?? null,
    pending: txn.pending,
    pendingTransactionId: txn.pending_transaction_id ?? null,
    categoryPrimary: txn.personal_finance_category?.primary ?? null,
    categoryDetailed: txn.personal_finance_category?.detailed ?? null,
    categoryConfidence:
      txn.personal_finance_category?.confidence_level ?? null,
    paymentChannel: txn.payment_channel ?? null,
    transactionCode: txn.transaction_code ?? null,
    checkNumber: txn.check_number ?? null,
    accountOwner: txn.account_owner ?? null,
    website: txn.website ?? null,
    logoUrl: txn.logo_url ?? null,
    categoryIconUrl: txn.personal_finance_category_icon_url ?? null,
    locationCity: txn.location?.city ?? null,
    locationRegion: txn.location?.region ?? null,
    locationPostalCode: txn.location?.postal_code ?? null,
    locationCountry: txn.location?.country ?? null,
    locationLat: txn.location?.lat ?? null,
    locationLon: txn.location?.lon ?? null,
    locationAddress: txn.location?.address ?? null,
    locationStoreNumber: txn.location?.store_number ?? null,
    counterpartiesJson: txn.counterparties
      ? JSON.stringify(txn.counterparties)
      : null,
    paymentMetaJson: txn.payment_meta ? JSON.stringify(txn.payment_meta) : null,
    runningBalance: txn.running_balance ?? null,
    updatedAt: new Date(),
  };
}
