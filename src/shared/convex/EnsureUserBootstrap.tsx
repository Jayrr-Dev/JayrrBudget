"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth, useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import { useEffect, useRef, type ReactNode } from "react";

const CLAIM_KEY = "jayrr-budget:ledgers-reassigned";

/**
 * After Convex Auth sign-in: one-time remap of imported ledger rows to this user.
 */
export function EnsureUserBootstrap({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const reassign = useMutation(api.migrations.reassignAllLedgersToCurrentUser);
  const ran = useRef(false);

  useEffect(() => {
    if (isLoading || !isAuthenticated || ran.current) return;
    if (typeof window !== "undefined" && window.localStorage.getItem(CLAIM_KEY)) {
      return;
    }
    ran.current = true;

    void (async () => {
      try {
        await reassign({});
        window.localStorage.setItem(CLAIM_KEY, "1");
      } catch (error) {
        console.warn("[auth] ledger reassign failed", error);
        ran.current = false;
      }
    })();
  }, [isAuthenticated, isLoading, reassign]);

  return children;
}

/** Sign-out helper for shell UI. */
export function useSignOut() {
  const { signOut } = useAuthActions();
  return signOut;
}
