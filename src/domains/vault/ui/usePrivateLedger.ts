"use client";

import { getVaultMasterKey, subscribeVaultSession } from "@/crypto/session";
import {
  hydrateVaultSession,
  type VaultClient,
} from "@/domains/vault/application/ensureVaultFromPasscode";
import {
  forgetPrivateLedgerMemo,
  loadPrivateLedger,
  type VaultListClient,
} from "@/domains/vault/application/loadPrivateLedger";
import { mergePlaceholderAccounts } from "@/domains/vault/application/mergePlaceholderAccounts";
import {
  clearEncryptedClassification,
  rewriteEncryptedTaxonomyLabels,
  vaultWriteReady,
} from "@/domains/vault/application/saveEncryptedLedger";
import type { PrivateLedger } from "@/domains/vault/domain/privateLedger";
import { subscribeFullyLocal } from "@/shared/offline/fullyLocalMode";
import { api } from "@convex/_generated/api";
import { useConvex, useConvexAuth, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

const EMPTY: PrivateLedger = {
  transactions: [],
  accounts: [],
  merchants: [],
  notes: [],
  scratchPads: [],
  loans: [],
  statementLogs: [],
  loanDocuments: [],
};

const CLASSIFICATION_CLEARED = "jayrr-classification-cleared";

let ledgerMaintenance: Promise<PrivateLedger | null> | null = null;

/** One pass for every mounted hook, so the same transaction is not saved twice. */
function maintainPrivateLedger(input: {
  write: NonNullable<ReturnType<typeof vaultWriteReady>>;
  ledger: PrivateLedger;
  role: string | undefined;
}) {
  if (ledgerMaintenance) return ledgerMaintenance;
  const run = (async () => {
    const txs = input.ledger.transactions;
    if (
      input.role === "admin" &&
      localStorage.getItem(CLASSIFICATION_CLEARED) !== "1" &&
      txs.some((tx) => tx.categoryName?.trim() || tx.sectionName?.trim())
    ) {
      const count = await clearEncryptedClassification(input.write, txs);
      localStorage.setItem(CLASSIFICATION_CLEARED, "1");
      if (count) toast.success(`Cleared labels on ${count} lines.`);
    } else {
      await rewriteEncryptedTaxonomyLabels(input.write, txs);
    }
    return mergePlaceholderAccounts({
      ctx: input.write,
      ledger: input.ledger,
    });
  })().catch((error: unknown) => {
    console.error(error);
    toast.error("Could not finish updating the ledger.");
    return null;
  });
  ledgerMaintenance = run;
  void run.finally(() => {
    if (ledgerMaintenance === run) ledgerMaintenance = null;
  });
  return run;
}

const ledgerListeners = new Set<() => void>();
let ledgerEpoch = 0;
let skipNextVaultReload = false;

function bumpLedgerEpoch() {
  ledgerEpoch += 1;
  for (const listener of ledgerListeners) listener();
}

/** Scratch-only writes bump vault.updatedAt; skip the following full ledger reload. */
export function skipNextPrivateLedgerReload() {
  skipNextVaultReload = true;
}

export function clearSkipNextPrivateLedgerReload() {
  skipNextVaultReload = false;
}

function consumeSkipNextVaultReload() {
  if (!skipNextVaultReload) return false;
  skipNextVaultReload = false;
  return true;
}

export function usePrivateLedger() {
  const { isAuthenticated } = useConvexAuth();
  const client = useConvex();
  const me = useQuery(api.users.me, isAuthenticated ? {} : "skip");
  const vault = useQuery(api.vaults.get, isAuthenticated ? {} : "skip");
  const [unlocked, setUnlocked] = useState(Boolean(getVaultMasterKey()));
  const [ledger, setLedger] = useState<PrivateLedger>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [hydrating, setHydrating] = useState(() => !getVaultMasterKey());
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(ledgerEpoch);
  const vaultUpdatedAt = vault?.updatedAt ?? 0;
  const vaultId = vault?.vaultId ?? null;
  const hasLedger = useRef(false);

  useEffect(() => {
    const onBump = () => setVersion(ledgerEpoch);
    ledgerListeners.add(onBump);
    return () => {
      ledgerListeners.delete(onBump);
    };
  }, []);

  useEffect(() => {
    setUnlocked(Boolean(getVaultMasterKey()));
    return subscribeVaultSession(() => {
      setUnlocked(Boolean(getVaultMasterKey()));
      bumpLedgerEpoch();
    });
  }, []);

  useEffect(() => {
    return subscribeFullyLocal(() => {
      forgetPrivateLedgerMemo();
      bumpLedgerEpoch();
    });
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    if (getVaultMasterKey()) {
      setHydrating(false);
      return;
    }
    let cancelled = false;
    setHydrating(true);
    void hydrateVaultSession(client as unknown as VaultClient).finally(() => {
      if (!cancelled) setHydrating(false);
    });
    return () => {
      cancelled = true;
    };
  }, [client, isAuthenticated, vaultId]);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!isAuthenticated || !me || !vaultId || !unlocked) {
        hasLedger.current = false;
        setLedger(EMPTY);
        setLoading(false);
        setError(null);
        return;
      }
      if (consumeSkipNextVaultReload() && hasLedger.current) {
        return;
      }
      if (!hasLedger.current) setLoading(true);
      setError(null);
      try {
        const next = await loadPrivateLedger(
          client as unknown as VaultListClient,
          {
            userId: String(me.userId),
            vaultId,
            vaultUpdatedAt,
          },
        );
        if (!cancelled) {
          hasLedger.current = true;
          setLedger(next);
          const write = vaultWriteReady({
            userId: String(me.userId),
            vaultId,
            keyId: vault?.currentKeyId ?? null,
            client,
          });
          if (write) {
            void maintainPrivateLedger({
              write,
              ledger: next,
              role: me.role,
            }).then((merged) => {
              if (cancelled || !merged || merged === next) return;
              setLedger(merged);
            });
          }
        }
      } catch (cause) {
        if (!cancelled) {
          setLedger(EMPTY);
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not decrypt the ledger.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [
    client,
    isAuthenticated,
    me,
    unlocked,
    vault,
    vaultId,
    vaultUpdatedAt,
    version,
  ]);

  const decrypting = Boolean(unlocked && vaultId && !hasLedger.current);

  return {
    encryptedLedger: isAuthenticated,
    unlocked,
    vaultReady: Boolean(vault),
    vaultId: vault?.vaultId ?? null,
    keyId: vault?.currentKeyId ?? null,
    userId: me ? String(me.userId) : null,
    loading:
      isAuthenticated &&
      (me === undefined ||
        vault === undefined ||
        loading ||
        decrypting ||
        hydrating),
    error,
    ledger,
    version,
    reload: bumpLedgerEpoch,
    applyLedger: (next: PrivateLedger) => {
      hasLedger.current = true;
      setLedger(next);
    },
  };
}
