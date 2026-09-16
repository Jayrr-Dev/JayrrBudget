"use client";

import {
  clearPendingPasscode,
  peekPendingPasscode,
  subscribePendingPasscode,
} from "@/crypto/pendingPasscode";
import { getVaultMasterKey, lockVault } from "@/crypto/session";
import {
  ensureVaultFromPasscode,
  hydrateVaultSession,
  type VaultClient,
} from "@/domains/vault/application/ensureVaultFromPasscode";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "@convex/_generated/api";
import { useConvex, useConvexAuth, useMutation } from "convex/react";
import { useEffect, useRef, useState, type ReactNode } from "react";

/** One-shot claim of pre-auth import rows (null userId). Never steals other users' ledgers. */
const CLAIM_UNOWNED_KEY = "jayrr-budget.claimed-unowned-ledgers";
const MERCHANT_BACKFILL_KEY = "jayrr-budget.merchant-backfill-v1";
const MERCHANT_TXN_COUNT_KEY = "jayrr-budget.merchant-txn-counts-v1";

/**
 * After Convex Auth sign-in:
 * - ensure role-based modules exist for this user
 * - optionally claim ledger rows that still have no userId
 * - sync merchant phone-book rows from transaction labels
 */
export function EnsureUserBootstrap({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const convex = useConvex();
  const claimUnowned = useMutation(api.migrations.claimUnownedData);
  const ensureModules = useMutation(api.modules.ensure);
  const ensureStarterTaxonomy = useMutation(api.classifications.ensureStarter);
  const backfillMerchants = useMutation(api.merchants.backfillFromTransactions);
  const syncMerchantTxnCounts = useMutation(
    api.merchants.syncTransactionCounts,
  );
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
    ranForSession.current = true;

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

      let alreadyBackfilled = false;
      let backfillCursor: string | null = null;
      try {
        const stored = localStorage.getItem(MERCHANT_BACKFILL_KEY);
        alreadyBackfilled = stored === "done";
        if (!alreadyBackfilled && stored) backfillCursor = stored;
      } catch {
        // ignore
      }
      if (!alreadyBackfilled) {
        try {
          for (let i = 0; i < 20; i += 1) {
            const result = await backfillMerchants({
              limit: 500,
              cursor: backfillCursor,
            });
            backfillCursor = result.continueCursor;
            try {
              localStorage.setItem(
                MERCHANT_BACKFILL_KEY,
                result.isDone ? "done" : (result.continueCursor ?? ""),
              );
            } catch {
              // ignore
            }
            if (result.isDone) break;
          }
        } catch (error) {
          console.warn("[auth] merchant backfill failed", error);
        }
      }

      let alreadyCounted = false;
      let countCursor: string | null = null;
      try {
        const stored = localStorage.getItem(MERCHANT_TXN_COUNT_KEY);
        alreadyCounted = stored === "done";
        if (!alreadyCounted && stored) countCursor = stored;
      } catch {
        // ignore
      }
      if (!alreadyCounted) {
        try {
          for (let i = 0; i < 40; i += 1) {
            const result = await syncMerchantTxnCounts({
              limit: 40,
              cursor: countCursor,
            });
            countCursor = result.continueCursor;
            try {
              localStorage.setItem(
                MERCHANT_TXN_COUNT_KEY,
                result.isDone ? "done" : (result.continueCursor ?? ""),
              );
            } catch {
              // ignore
            }
            if (result.isDone) break;
          }
        } catch (error) {
          console.warn("[auth] merchant txn count sync failed", error);
        }
      }
    })();
  }, [
    isAuthenticated,
    isLoading,
    claimUnowned,
    backfillMerchants,
    syncMerchantTxnCounts,
  ]);

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
    if (!isAuthenticated) {
      ranForSession.current = false;
      vaultSyncForSession.current = false;
      lockVault();
    }
  }, [isAuthenticated]);

  return children;
}

/** Sign-out helper for shell UI. */
export function useSignOut() {
  const { signOut } = useAuthActions();
  return () => {
    clearPendingPasscode();
    lockVault();
    return signOut();
  };
}
