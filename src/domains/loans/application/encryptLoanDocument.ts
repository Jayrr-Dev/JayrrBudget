import type { MutationClient, PrivateRecordInput } from "@/crypto/vaultRecords";
import { savePrivateRecords } from "@/crypto/vaultRecords";
import type { LoanDocumentFields } from "@/domains/loans/domain/loanDocumentFields";
import type { PrivateLedger } from "@/domains/vault/domain/privateLedger";

/** Encrypt loan-document OCR + metadata (same document kind pattern as statements). */
export async function encryptLoanDocumentToVault(input: {
  client: MutationClient;
  userId: string;
  vaultId: string;
  keyId: string;
  masterKey: CryptoKey;
  filename: string;
  fileHash: string;
  pageCount: number;
  fields: LoanDocumentFields;
  ocrMarkdown: string;
  accountId?: string | null;
  ledger?: PrivateLedger;
}) {
  const fileHash = input.fileHash.trim() || `loan-doc-${Date.now()}`;
  const documentRecordId = `loan-doc-${fileHash}`;
  const ocrRecordId = `loan-ocr-${fileHash}`;
  const existing = input.ledger?.loanDocuments.find(
    (doc) => doc.fileHash === fileHash || doc.recordId === documentRecordId,
  );
  const now = new Date().toISOString();

  const records: PrivateRecordInput[] = [
    {
      recordId: documentRecordId,
      kind: "document",
      value: {
        type: "loan_document",
        filename: input.filename || "loan.pdf",
        fileHash,
        status: "completed",
        pageCount: input.pageCount,
        accountId: input.accountId ?? existing?.accountId ?? null,
        fields: input.fields,
        createdAt: existing?.createdAt ?? now,
        ocrRecordId,
      },
      expectedRevision: existing?.revision ?? null,
    },
    {
      recordId: ocrRecordId,
      kind: "document",
      value: {
        type: "loan_ocr",
        loanDocumentRecordId: documentRecordId,
        fileHash,
        filename: input.filename || "loan.pdf",
        ocrMarkdown: input.ocrMarkdown ?? "",
      },
      expectedRevision: existing?.ocrRevision ?? null,
    },
  ];

  await savePrivateRecords(input.client, {
    userId: input.userId,
    vaultId: input.vaultId,
    keyId: input.keyId,
    masterKey: input.masterKey,
    records,
  });

  return { documentRecordId, ocrRecordId, fileHash };
}

/** Attach a previously encrypted loan document to a new loan account id. */
export async function linkEncryptedLoanDocument(input: {
  client: MutationClient;
  userId: string;
  vaultId: string;
  keyId: string;
  masterKey: CryptoKey;
  fileHash: string;
  accountId: string;
  ledger: PrivateLedger;
}) {
  const doc = input.ledger.loanDocuments.find(
    (row) => row.fileHash === input.fileHash,
  );
  if (!doc) return;

  await savePrivateRecords(input.client, {
    userId: input.userId,
    vaultId: input.vaultId,
    keyId: input.keyId,
    masterKey: input.masterKey,
    records: [
      {
        recordId: doc.recordId,
        kind: "document",
        value: {
          type: "loan_document",
          filename: doc.filename,
          fileHash: doc.fileHash,
          status: doc.status,
          pageCount: doc.pageCount,
          accountId: input.accountId,
          fields: doc.fields,
          createdAt: doc.createdAt,
          ocrRecordId: doc.ocrRecordId ?? `loan-ocr-${doc.fileHash}`,
        },
        expectedRevision: doc.revision,
      },
    ],
  });
}
