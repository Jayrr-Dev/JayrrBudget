"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth, useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import { useEffect, useRef, type ReactNode } from "react";

/** One-shot claim of pre-auth import rows (null userId). Never steals other users' ledgers. */
const CLAIM_UNOWNED_KEY = "jayrr-budget.claimed-unowned-ledgers";

/**
 * After Convex Auth sign-in:
 * - ensure role-based modules exist for this user
 * - optionally claim ledger rows that still have no userId
 */
export function EnsureUserBootstrap({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const claimUnowned = useMutation(api.migrations.claimUnownedData);
  const ensureModules = useMutation(api.modules.ensure);
  const ranForSession = useRef(false);

  useEffect(() => {
    if (isLoading || !isAuthenticated || ranForSession.current) return;
    ranForSession.current = true;

    void (async () => {
      try {
        await ensureModules({});
      } catch (error) {
        console.warn("[auth] ensure modules failed", error);
        ranForSession.current = false;
        return;
      }

      let alreadyClaimed = false;
      try {
        alreadyClaimed = localStorage.getItem(CLAIM_UNOWNED_KEY) === "1";
      } catch {
        // ignore
      }
      if (alreadyClaimed) return;

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
    })();
  }, [isAuthenticated, isLoading, claimUnowned, ensureModules]);

  useEffect(() => {
    if (!isAuthenticated) {
      ranForSession.current = false;
    }
  }, [isAuthenticated]);

  return children;
}

/** Sign-out helper for shell UI. */
export function useSignOut() {
  const { signOut } = useAuthActions();
  return signOut;
}
