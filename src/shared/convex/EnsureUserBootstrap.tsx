"use client";

import { useAuth } from "@clerk/nextjs";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import { useEffect, useRef, type ReactNode } from "react";

const CLAIM_KEY = "jayrr-budget:claimed-unowned";

/**
 * After Clerk sign-in: create Convex users row, then one-time claim of
 * pre-auth import rows (localStorage guards repeat runs per browser).
 */
export function EnsureUserBootstrap({ children }: { children: ReactNode }) {
  const { isSignedIn, isLoaded } = useAuth();
  const ensure = useMutation(api.users.ensure);
  const claim = useMutation(api.migrations.claimUnownedData);
  const ran = useRef(false);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || ran.current) return;
    ran.current = true;

    void (async () => {
      try {
        await ensure({});
        if (typeof window === "undefined") return;
        if (window.localStorage.getItem(CLAIM_KEY)) return;
        await claim({});
        window.localStorage.setItem(CLAIM_KEY, "1");
      } catch (error) {
        console.warn("[auth] ensure/claim failed", error);
        ran.current = false;
      }
    })();
  }, [isLoaded, isSignedIn, ensure, claim]);

  return children;
}
