import { api } from "@convex/_generated/api";
import { encryptJson, envelopeMetadata } from "./envelope";
import type { EnvelopeKind } from "./types";

export type PrivateRecordInput = {
  recordId: string;
  kind: EnvelopeKind;
  value: unknown;
  deleted?: boolean;
  expectedRevision?: number | null;
};

export type MutationClient = {
  mutation: (reference: unknown, args: unknown) => Promise<unknown>;
};

export type SavePrivateRecordsResult = {
  saved: number;
  revisions: Array<{ recordId: string; revision: number }>;
};

/** Encrypts records in the browser before invoking the Convex ciphertext mutation. */
export async function savePrivateRecords(
  client: MutationClient,
  input: {
    userId: string;
    vaultId: string;
    keyId: string;
    masterKey: CryptoKey;
    records: PrivateRecordInput[];
  },
) {
  const encrypted = await Promise.all(
    input.records.map(async (record) => {
      const envelope = await encryptJson(
        record.value,
        {
          userId: input.userId,
          recordId: record.recordId,
          kind: record.kind,
          keyId: input.keyId,
        },
        input.masterKey,
      );
      const data = envelopeMetadata(envelope);
      return {
        ...data,
        expectedRevision: record.expectedRevision ?? null,
        deleted: record.deleted ?? false,
      };
    }),
  );
  return client.mutation(api.vaults.saveRecords, {
    vaultId: input.vaultId,
    records: encrypted,
  }) as Promise<SavePrivateRecordsResult>;
}

/** Removes vault rows by id. Also sweeps leftover deleted tombstones in that vault. */
export async function deletePrivateRecords(
  client: MutationClient,
  input: { vaultId: string; recordIds: string[] },
) {
  return client.mutation(api.vaults.deleteRecords, {
    vaultId: input.vaultId,
    recordIds: input.recordIds,
  }) as Promise<{ removed: number }>;
}
