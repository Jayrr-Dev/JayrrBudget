"use client";

import { installConvexOfflineWriteGuard } from "@/shared/offline/offlineWriteGuard";
import { ConvexAuthNextjsProvider } from "@convex-dev/auth/nextjs";
import { ConvexReactClient } from "convex/react";
import { type ReactNode, useMemo } from "react";

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  const client = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!url) {
      throw new Error("Missing NEXT_PUBLIC_CONVEX_URL in environment");
    }
    const next = new ConvexReactClient(url);
    installConvexOfflineWriteGuard(next);
    return next;
  }, []);

  return (
    <ConvexAuthNextjsProvider client={client}>{children}</ConvexAuthNextjsProvider>
  );
}
