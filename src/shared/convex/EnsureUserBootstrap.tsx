"use client";

import {
  clearPendingPasscode,
  peekPendingPasscode,
  subscribePendingPasscode,
} from "@/crypto/pendingPasscode";
import { getVaultMasterKey, lockVault } from "@/crypto/session";
import { useFeatureFlag } from "@/domains/feature-flags/ui/useFeatureFlag";
import {
  ensureVaultFromPasscode,
  hydrateVaultSession,
  type VaultClient,
} from "@/domains/vault/application/ensureVaultFromPasscode";
import { clearLedgerQuerySnapshots } from "@/domains/dashboard/ui/ledgerQuerySnapshot";
import { clearPersistedLastView } from "@/domains/dashboard/ui/lastViewCache";
import { useConnectionState } from "@/shared/offline/useConnectionState";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "@convex/_generated/api";
import { useConvex, useConvexAuth, useMutation } from "convex/react";
import { useEffect, useRef, useState, type ReactNode } from "react";

/** One-shot claim of pre-auth import rows (null userId). Never steals other users' ledgers. */
const CLAIM_UNOWNED_KEY = "jayrr-budget.claimed-unowned-ledgers";

/**
 * After Convex Auth sign-in:
 * - ensure role-based modules exist for this user
 * - seed starter taxonomy
 * - skip plaintext ledger claim/merchant backfill (private ledger is the money store)
 */
export function EnsureUserBootstrap({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { isOffline } = useConnectionState();
  const convex = useConvex();
  const encryptedLedger = useFeatureFlag("encryptedLedger");
  const claimUnowned = useMutation(api.migrations.claimUnownedData);
  const ensureModules = useMutation(api.modules.ensure);
  const ensureStarterTaxonomy = useMutation(api.classifications.ensureStarter);
  const ranForSession = useRef(false);
  const vaultSyncForSession = useRef(false);
  const [hasPasscode, setHasPasscode] = useState(() =>
    Boolean(peekPendingPasscode()),
  );

  useEffect(
    () =>
      subscribePendingPasscode(() =>
        setHasPasscode(Boolean(peekPendingPasscode())),
      ),
    [],
  );

  useEffect(() => {
    if (isLoading || !isAuthenticated) return;
    void ensureModules({}).catch((error) => {
      console.warn("[auth] ensure modules failed", error);
    });
    void ensureStarterTaxonomy({}).catch((error) => {
      console.warn("[auth] ensure starter taxonomy failed", error);
    });
  }, [ensureModules, ensureStarterTaxonomy, isAuthenticated, isLoading]);

  useEffect(() => {
    if (isLoading || !isAuthenticated || ranForSession.current) return;
    // Private ledger is the money store: skip plaintext claim/merchant backfill.
    ranForSession.current = true;
    if (encryptedLedger) return;

    void (async () => {
      let alreadyClaimed = false;
      try {
        alreadyClaimed = localStorage.getItem(CLAIM_UNOWNED_KEY) === "1";
      } catch {
        // ignore
      }
      if (!alreadyClaimed) {
        try {
          await claimUnowned({});
          try {
            localStorage.setItem(CLAIM_UNOWNED_KEY, "1");
          } catch {
            // ignore
          }
        } catch (error) {
          console.warn("[auth] claim unowned ledgers failed", error);
        }
      }
    })();
  }, [claimUnowned, encryptedLedger, isAuthenticated, isLoading]);

  useEffect(() => {
    if (isLoading || !isAuthenticated || vaultSyncForSession.current) return;
    const passcode = peekPendingPasscode();
    if (!passcode) return;
    if (getVaultMasterKey()) {
      clearPendingPasscode();
      vaultSyncForSession.current = true;
      return;
    }
    vaultSyncForSession.current = true;
    void ensureVaultFromPasscode(convex as unknown as VaultClient, passcode)
      .then((result) => {
        if (result !== "mismatch") clearPendingPasscode();
      })
      .catch((error) => {
        vaultSyncForSession.current = false;
        console.warn("[auth] vault passcode sync failed", error);
      });
  }, [convex, hasPasscode, isAuthenticated, isLoading]);

  useEffect(() => {
    if (isLoading || !isAuthenticated) return;
    if (getVaultMasterKey()) return;
    void hydrateVaultSession(convex as unknown as VaultClient).catch(
      (error) => {
        console.warn("[auth] vault device unlock failed", error);
      },
    );
  }, [convex, isAuthenticated, isLoading]);

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated && !isOffline) {
      ranForSession.current = false;
      vaultSyncForSession.current = false;
      lockVault();
    }
  }, [isAuthenticated, isLoading, isOffline]);

  return children;
}

/** Sign-out helper for shell UI. Clears local state first, then Convex. */
export function useSignOut() {
  const { signOut } = useAuthActions();
  return async () => {
    clearPendingPasscode();
    lockVault();
    clearLedgerQuerySnapshots();
    await clearPersistedLastView();
    try {
      await signOut();
    } catch {
      // Offline signOut rejects. Local state is already gone.
    }
  };
}
