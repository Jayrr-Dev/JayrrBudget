"use client";

import { api } from "@convex/_generated/api";
import { useConvexAuth, useMutation } from "convex/react";
import { useEffect, useRef } from "react";

const INTERVAL_MS = 30_000;

/**
 * While the signed-in user has the app tab visible, send elapsed time
 * to Convex so the Users dashboard can show time-in-app.
 */
export function TrackingUsageHeartbeat() {
  const { isAuthenticated } = useConvexAuth();
  const heartbeat = useMutation(api.userMetrics.heartbeat);
  const lastAt = useRef<number | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      lastAt.current = null;
      return;
    }

    const flush = () => {
      const now = Date.now();
      const prev = lastAt.current;
      if (prev != null) {
        const deltaMs = now - prev;
        if (deltaMs >= 1_000) {
          void heartbeat({ deltaMs }).catch(() => undefined);
        }
      }
      if (document.visibilityState === "visible") {
        lastAt.current = now;
        return;
      }
      lastAt.current = null;
    };

    lastAt.current = Date.now();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") flush();
    }, INTERVAL_MS);
    document.addEventListener("visibilitychange", flush);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", flush);
      flush();
    };
  }, [heartbeat, isAuthenticated]);

  return null;
}
