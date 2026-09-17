"use client";

import { getVaultMasterKey, subscribeVaultSession } from "@/crypto/session";
import { useFeatureFlag } from "@/domains/feature-flags/ui/useFeatureFlag";
import {
  hydrateVaultSession,
  type VaultClient,
} from "@/domains/vault/application/ensureVaultFromPasscode";
import {
  loadPrivateLedger,
  type VaultListClient,
} from "@/domains/vault/application/loadPrivateLedger";
import {
  rewriteEncryptedTaxonomyLabels,
  vaultWriteReady,
} from "@/domains/vault/application/saveEncryptedLedger";
import type { PrivateLedger } from "@/domains/vault/domain/privateLedger";
import { api } from "@convex/_generated/api";
import { useConvex, useConvexAuth, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";

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
  const encryptedLedger = useFeatureFlag("encryptedLedger");
  const { isAuthenticated } = useConvexAuth();
  const client = useConvex();
  const me = useQuery(api.users.me, isAuthenticated ? {} : "skip");
  const vault = useQuery(
    api.vaults.get,
    isAuthenticated && encryptedLedger ? {} : "skip",
  );
  const [unlocked, setUnlocked] = useState(Boolean(getVaultMasterKey()));
  const [ledger, setLedger] = useState<PrivateLedger>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [hydrating, setHydrating] = useState(() => !getVaultMasterKey());
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(ledgerEpoch);
  const vaultUpdatedAt = vault?.updatedAt ?? 0;
  const vaultId = vault?.vaultId ?? null;
  const hasLedger = useRef(false);
  const rewritingLabels = useRef(false);

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
    if (!encryptedLedger || !isAuthenticated) return;
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
  }, [client, encryptedLedger, isAuthenticated, vaultId]);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!encryptedLedger || !me || !vaultId || !unlocked) {
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
            encryptedLedger: true,
            userId: String(me.userId),
            vaultId,
            keyId: vault?.currentKeyId ?? null,
            client,
          });
          if (write) {
            if (!rewritingLabels.current) {
              rewritingLabels.current = true;
              void rewriteEncryptedTaxonomyLabels(write, next.transactions)
                .catch(() => undefined)
                .finally(() => {
                  rewritingLabels.current = false;
                });
            }
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
  }, [client, encryptedLedger, me, unlocked, vaultId, vaultUpdatedAt, version]);

  const decrypting = Boolean(unlocked && vaultId && !hasLedger.current);

  return {
    encryptedLedger,
    unlocked,
    vaultReady: Boolean(vault),
    vaultId: vault?.vaultId ?? null,
    keyId: vault?.currentKeyId ?? null,
    userId: me ? String(me.userId) : null,
    loading:
      encryptedLedger &&
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
