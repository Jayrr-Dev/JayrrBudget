"use client";

import { api } from "@convex/_generated/api";
import { useConvex, useConvexAuth, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { getVaultMasterKey, subscribeVaultSession } from "@/crypto/session";
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
};

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
  const [version, setVersion] = useState(0);

  useEffect(() => {
    setUnlocked(Boolean(getVaultMasterKey()));
    return subscribeVaultSession(() => {
      setUnlocked(Boolean(getVaultMasterKey()));
      setVersion((value) => value + 1);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!encryptedLedger || !me || !vault || !unlocked) {
        setLedger(EMPTY);
        setLoading(false);
        setError(null);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const next = await loadPrivateLedger(client as unknown as VaultListClient, {
          userId: String(me.userId),
          vaultId: vault.vaultId,
        });
        if (!cancelled) setLedger(next);
      } catch (cause) {
        if (!cancelled) {
          setLedger(EMPTY);
          setError(cause instanceof Error ? cause.message : "Could not decrypt private ledger.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [client, encryptedLedger, me, unlocked, vault, version]);

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
    reload: () => setVersion((value) => value + 1),
  };
}
