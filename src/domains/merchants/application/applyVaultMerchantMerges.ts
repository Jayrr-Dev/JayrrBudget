import {
  deletePrivateRecords,
  type MutationClient,
} from "@/crypto/vaultRecords";
import {
  saveEncryptedMerchant,
  saveEncryptedRecords,
  type VaultWriteContext,
} from "@/domains/vault/application/saveEncryptedLedger";
import type { PrivateLedger } from "@/domains/vault/domain/privateLedger";

const TX_CHUNK = 40;

export type VaultMerchantMergePlan = {
  canonicalName: string;
  merchantIds: string[];
};

function txnMerchantLabel(tx: {
  merchantClean?: string | null;
  merchantName?: string | null;
}) {
  return (tx.merchantClean ?? tx.merchantName ?? "").trim();
}

/**
 * Rename keeper, retarget vault txs, delete the other merchant records.
 */
export async function applyVaultMerchantMerges(input: {
  ctx: VaultWriteContext;
  ledger: PrivateLedger;
  merges: VaultMerchantMergePlan[];
}): Promise<{
  mergesApplied: number;
  merchantsDeleted: number;
  transactionsUpdated: number;
}> {
  let merchantsDeleted = 0;
  let transactionsUpdated = 0;
  let mergesApplied = 0;
  const merchants = [...input.ledger.merchants];
  const txs = [...input.ledger.transactions];

  for (const merge of input.merges) {
    const members = merchants.filter((merchant) =>
      merge.merchantIds.includes(merchant.recordId),
    );
    if (members.length === 0) continue;

    const canonicalName = merge.canonicalName.trim();
    if (!canonicalName) continue;

    const exact = members.find(
      (member) =>
        member.name.trim().toLowerCase() === canonicalName.toLowerCase(),
    );
    const keeper =
      exact ?? [...members].sort((a, b) => a.name.length - b.name.length)[0];
    if (!keeper) continue;

    const fromNames = new Set(members.map((member) => member.name.trim()));
    const sources = members.filter(
      (member) => member.recordId !== keeper.recordId,
    );

    await saveEncryptedMerchant(input.ctx, {
      merchantId: keeper.merchantId,
      name: canonicalName,
      rawName: keeper.rawName ?? null,
      company: keeper.company ?? null,
      brand: keeper.brand ?? null,
      website: keeper.website ?? null,
      logoUrl: keeper.logoUrl ?? null,
      expectedRevision: keeper.revision,
    });
    keeper.name = canonicalName;
    keeper.revision += 1;

    const matches = txs.filter((tx) => fromNames.has(txnMerchantLabel(tx)));
    for (let i = 0; i < matches.length; i += TX_CHUNK) {
      const chunk = matches.slice(i, i + TX_CHUNK);
      await saveEncryptedRecords(
        input.ctx,
        chunk.map((tx) => {
          const next = { ...tx, merchantClean: canonicalName };
          const { recordId, revision, ...value } = next;
          return {
            recordId,
            kind: "tx" as const,
            value: {
              date: value.date,
              authorizedDate: value.authorizedDate ?? null,
              description: value.description,
              amount: value.amount,
              currency: value.currency,
              accountId: value.accountId ?? null,
              pending: Boolean(value.pending),
              city: value.city ?? null,
              region: value.region ?? null,
              country: value.country ?? null,
              merchantName: value.merchantName ?? null,
              merchantClean: canonicalName,
              sectionName: value.sectionName ?? null,
              categoryName: value.categoryName ?? null,
              subcategoryName: value.subcategoryName ?? null,
              spreadName: value.spreadName ?? null,
              transactionTypeName: value.transactionTypeName ?? null,
              txnCode: value.txnCode ?? null,
              channel: value.channel ?? null,
              statementRecordId: value.statementRecordId ?? null,
              source: value.source ?? "statement",
              tagNames: value.tagNames ?? [],
            },
            expectedRevision: revision,
          };
        }),
      );
      for (const tx of chunk) {
        tx.merchantClean = canonicalName;
        tx.revision += 1;
      }
      transactionsUpdated += chunk.length;
    }

    if (sources.length > 0) {
      await deletePrivateRecords(
        input.ctx.client as unknown as MutationClient,
        {
          vaultId: input.ctx.vaultId,
          recordIds: sources.map((source) => source.recordId),
        },
      );
      merchantsDeleted += sources.length;
      for (const source of sources) {
        const index = merchants.findIndex(
          (row) => row.recordId === source.recordId,
        );
        if (index >= 0) merchants.splice(index, 1);
      }
    }

    mergesApplied += 1;
  }

  return { mergesApplied, merchantsDeleted, transactionsUpdated };
}
