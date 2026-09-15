"use client";

import { api } from "@convex/_generated/api";
import { useConvex, useConvexAuth, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { getVaultMasterKey, subscribeVaultSession } from "@/crypto/session";
import { hydrateVaultSession, type VaultClient } from "@/domains/vault/application/ensureVaultFromPasscode";
import { useFeatureFlag } from "@/domains/feature-flags/ui/useFeatureFlag";
import { loadPrivateLedger, type VaultListClient } from "@/domains/vault/application/loadPrivateLedger";
import type { PrivateLedger } from "@/domains/vault/domain/privateLedger";

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

function bumpLedgerEpoch() {
  ledgerEpoch += 1;
  for (const listener of ledgerListeners) listener();
}

export function usePrivateLedger() {
  const encryptedLedger = useFeatureFlag("encryptedLedger");
  const { isAuthenticated } = useConvexAuth();
  const client = useConvex();
  const me = useQuery(api.users.me, isAuthenticated ? {} : "skip");
  const vault = useQuery(api.vaults.get, isAuthenticated && encryptedLedger ? {} : "skip");
  const [unlocked, setUnlocked] = useState(Boolean(getVaultMasterKey()));
  const [ledger, setLedger] = useState<PrivateLedger>(EMPTY);
  const [loading, setLoading] = useState(false);
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
    if (!encryptedLedger || !isAuthenticated) return;
    if (getVaultMasterKey()) return;
    void hydrateVaultSession(client as unknown as VaultClient);
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
      if (!hasLedger.current) setLoading(true);
      setError(null);
      try {
        const next = await loadPrivateLedger(client as unknown as VaultListClient, {
          userId: String(me.userId),
          vaultId,
        });
        if (!cancelled) {
          hasLedger.current = true;
          setLedger(next);
        }
      } catch (cause) {
        if (!cancelled) {
          setLedger(EMPTY);
          setError(cause instanceof Error ? cause.message : "Could not decrypt the ledger.");
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

  return {
    encryptedLedger,
    unlocked,
    vaultReady: Boolean(vault),
    vaultId: vault?.vaultId ?? null,
    keyId: vault?.currentKeyId ?? null,
    userId: me ? String(me.userId) : null,
    loading: encryptedLedger && (me === undefined || vault === undefined || loading),
    error,
    ledger,
    reload: bumpLedgerEpoch,
  };
}
