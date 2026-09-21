import { forgetPrivateLedgerMemo } from "@/domains/vault/application/loadPrivateLedger";
import { isFullyLocal } from "@/shared/offline/fullyLocalMode";
import { api } from "@convex/_generated/api";
import {
  readVaultCiphertextCache,
  writeVaultCiphertextCache,
  type CachedCiphertextRecord,
} from "./ciphertextCache";
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
  if (isFullyLocal()) {
    return saveRecordsLocally(input.userId, input.vaultId, encrypted);
  }
  const saved = (await client.mutation(api.vaults.saveRecords, {
    vaultId: input.vaultId,
    records: encrypted,
  })) as SavePrivateRecordsResult;
  forgetPrivateLedgerMemo();
  return saved;
}

type EncryptedSaveRow = {
  v: number;
  alg: string;
  keyId: string;
  kind: string;
  recordId: string;
  iv: ArrayBuffer;
  wrappedDek: ArrayBuffer;
  ciphertext: ArrayBuffer;
  expectedRevision: number | null;
  deleted: boolean;
};

async function saveRecordsLocally(
  userId: string,
  vaultId: string,
  encrypted: EncryptedSaveRow[],
): Promise<SavePrivateRecordsResult> {
  const cached = await readVaultCiphertextCache(vaultId);
  const records = [...(cached?.records ?? [])];
  const index = new Map(records.map((row, at) => [row.recordId, at]));
  const revisions: SavePrivateRecordsResult["revisions"] = [];
  const now = Date.now();

  for (const row of encrypted) {
    const at = index.get(row.recordId);
    const prev = at == null ? undefined : records[at];
    if (
      row.expectedRevision != null &&
      prev &&
      prev.revision !== row.expectedRevision
    ) {
      throw new Error("This row changed on this device. Reload and try again.");
    }
    const revision = (prev?.revision ?? row.expectedRevision ?? 0) + 1;
    const next: CachedCiphertextRecord = {
      recordId: row.recordId,
      kind: row.kind,
      revision,
      keyId: row.keyId,
      deleted: row.deleted,
      createdAt: prev?.createdAt || now,
      updatedAt: now,
      v: row.v,
      alg: row.alg,
      iv: row.iv,
      wrappedDek: row.wrappedDek,
      ciphertext: row.ciphertext,
    };
    if (at == null) {
      index.set(row.recordId, records.length);
      records.push(next);
    } else {
      records[at] = next;
    }
    revisions.push({ recordId: row.recordId, revision });
  }

  const live = records.filter((row) => !row.deleted);
  await writeVaultCiphertextCache(
    {
      v: 1,
      vaultId,
      userId,
      updatedAt: cached?.updatedAt ?? now,
      records: live,
    },
    { strict: true },
  );
  forgetPrivateLedgerMemo();
  return { saved: revisions.length, revisions };
}

/** Removes vault rows by id. Also sweeps leftover deleted tombstones in that vault. */
export async function deletePrivateRecords(
  client: MutationClient,
  input: { vaultId: string; recordIds: string[] },
) {
  if (isFullyLocal()) {
    return deleteRecordsLocally(input.vaultId, input.recordIds);
  }
  return client.mutation(api.vaults.deleteRecords, {
    vaultId: input.vaultId,
    recordIds: input.recordIds,
  }) as Promise<{ removed: number }>;
}

async function deleteRecordsLocally(vaultId: string, recordIds: string[]) {
  const cached = await readVaultCiphertextCache(vaultId);
  if (!cached) {
    throw new Error("No local ledger on this device yet.");
  }
  const drop = new Set(recordIds);
  const records = cached.records.filter((row) => !drop.has(row.recordId));
  await writeVaultCiphertextCache(
    { ...cached, records },
    { strict: true },
  );
  forgetPrivateLedgerMemo();
  return { removed: cached.records.length - records.length };
}
