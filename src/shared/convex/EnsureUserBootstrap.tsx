"use client";

import {
  clearPendingPasscode,
  peekPendingPasscode,
  subscribePendingPasscode,
} from "@/crypto/pendingPasscode";
import { getVaultMasterKey, lockVault } from "@/crypto/session";
import { clearPersistedLastView } from "@/domains/dashboard/ui/lastViewCache";
import { clearLedgerQuerySnapshots } from "@/domains/dashboard/ui/ledgerQuerySnapshot";
import {
  ensureVaultFromPasscode,
  hydrateVaultSession,
  type VaultClient,
} from "@/domains/vault/application/ensureVaultFromPasscode";
import { useConnectionState } from "@/shared/offline/useConnectionState";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "@convex/_generated/api";
import { useConvex, useConvexAuth, useMutation } from "convex/react";
import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * After Convex Auth sign-in:
 * - ensure role-based modules exist for this user
 * - seed starter taxonomy
 */
export function EnsureUserBootstrap({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { isOffline } = useConnectionState();
  const convex = useConvex();
  const ensureModules = useMutation(api.modules.ensure);
  const ensureStarterTaxonomy = useMutation(api.classifications.ensureStarter);
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
