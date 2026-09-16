"use client";

import { api } from "@convex/_generated/api";
import { useConvexAuth, useQuery } from "convex/react";
import { useCallback, useEffect, useState } from "react";
import { readPiggyHistory, writePiggyHistory } from "../application/piggyHistoryStorage";

export function usePiggyHistory<T>(scope: string, restore: (value: unknown) => T) {
  const { isAuthenticated } = useConvexAuth();
  const me = useQuery(api.users.me, isAuthenticated ? {} : "skip");
  const owner = isAuthenticated ? me?.userId : undefined;
  const identity = JSON.stringify([owner, scope]);
  const [loaded, setLoaded] = useState<{ identity: string; value: T; writable: boolean }>();
  const [failure, setFailure] = useState<{ identity: string; text: string }>();
  useEffect(() => {
    if (!owner) return;
    let cancelled = false;
    void readPiggyHistory(owner, scope).then((value) => {
      if (!cancelled) setLoaded({ identity, value: restore(value), writable: true });
    }).catch(() => {
      if (cancelled) return;
      // Allow temporary chat, but never overwrite unreadable saved history.
      setLoaded({ identity, value: restore(undefined), writable: false });
      setFailure({ identity, text: "Saved chats could not be loaded. This conversation will not be saved; reload to retry." });
    });
    return () => { cancelled = true; };
  }, [identity, owner, restore, scope]);
  const writable = loaded?.identity === identity && loaded.writable;
  const save = useCallback((value: T) => {
    if (!owner || !writable) return;
    void writePiggyHistory(owner, scope, value).then(() => {
      setFailure((previous) => previous?.identity === identity ? undefined : previous);
    }).catch(() => {
      setFailure({ identity, text: "Chat history could not be saved on this browser. Keep this page open and free browser storage." });
    });
  }, [identity, owner, scope, writable]);
  return {
    owner,
    ready: Boolean(owner && loaded?.identity === identity),
    initial: loaded?.identity === identity ? loaded.value : undefined,
    error: failure?.identity === identity ? failure.text : undefined,
    save,
  };
}
