import type { MutationClient } from "@/crypto/vaultRecords";
import { deletePrivateRecords } from "@/crypto/vaultRecords";
import type { PrivateLedger } from "@/domains/vault/domain/privateLedger";

function uniqueIds(ids: Array<string | null | undefined>) {
  return [...new Set(ids.filter((id): id is string => Boolean(id)))];
}

/** Remove a lending account, its terms, and any linked loan-document OCR. Bank payments stay. */
export async function deleteVaultLoan(input: {
  client: MutationClient;
  vaultId: string;
  accountId: string;
  ledger: PrivateLedger;
}) {
  const account = input.ledger.accounts.find(
    (row) => row.accountId === input.accountId,
  );
  const loan = input.ledger.loans.find(
    (row) => row.accountId === input.accountId,
  );
  if (!account && !loan) {
    throw new Error("That lending account was not found.");
  }

  const docs = input.ledger.loanDocuments.filter(
    (doc) => doc.accountId === input.accountId,
  );
  const recordIds = uniqueIds([
    account?.recordId ?? `account-${input.accountId}`,
    loan?.recordId ?? `loan-${input.accountId}`,
    ...docs.flatMap((doc) => [
      doc.recordId,
      doc.ocrRecordId,
      doc.fileHash ? `loan-ocr-${doc.fileHash}` : null,
    ]),
  ]);

  await deletePrivateRecords(input.client, {
    vaultId: input.vaultId,
    recordIds,
  });

  const removedDocIds = new Set(docs.map((doc) => doc.recordId));
  const nextLedger: PrivateLedger = {
    ...input.ledger,
    accounts: input.ledger.accounts.filter(
      (row) => row.accountId !== input.accountId,
    ),
    loans: input.ledger.loans.filter(
      (row) => row.accountId !== input.accountId,
    ),
    loanDocuments: input.ledger.loanDocuments.filter(
      (doc) => !removedDocIds.has(doc.recordId),
    ),
  };

  return { nextLedger };
}
