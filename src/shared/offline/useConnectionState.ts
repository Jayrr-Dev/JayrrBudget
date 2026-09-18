"use client";

import { useConvex, useConvexAuth } from "convex/react";
import { useEffect, useState, useSyncExternalStore } from "react";

type ConvexWire = {
  isWebSocketConnected: boolean;
  hasEverConnected: boolean;
};

function subscribeBrowserOnline(onStoreChange: () => void) {
  window.addEventListener("online", onStoreChange);
  window.addEventListener("offline", onStoreChange);
  return () => {
    window.removeEventListener("online", onStoreChange);
    window.removeEventListener("offline", onStoreChange);
  };
}

function getBrowserOnline() {
  return navigator.onLine;
}

function getBrowserOnlineServer() {
  return true;
}

/**
 * Browser online flag plus Convex websocket, if the client exposes it.
 * Offline is not the same as signed out: Convex auth is false whenever the
 * socket cannot connect, including airplane mode with a still-valid cookie.
 */
export function useConnectionState() {
  const { isAuthenticated, isLoading: isAuthLoading } = useConvexAuth();
  const convex = useConvex();
  const browserOnline = useSyncExternalStore(
    subscribeBrowserOnline,
    getBrowserOnline,
    getBrowserOnlineServer,
  );
  const [convexWire, setConvexWire] = useState<ConvexWire | null>(() => {
    try {
      const state = convex.connectionState();
      return {
        isWebSocketConnected: state.isWebSocketConnected,
        hasEverConnected: state.hasEverConnected,
      };
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (typeof convex.subscribeToConnectionState !== "function") return;
    try {
      const state = convex.connectionState();
      setConvexWire({
        isWebSocketConnected: state.isWebSocketConnected,
        hasEverConnected: state.hasEverConnected,
      });
      return convex.subscribeToConnectionState((next) => {
        setConvexWire({
          isWebSocketConnected: next.isWebSocketConnected,
          hasEverConnected: next.hasEverConnected,
        });
      });
    } catch {
      setConvexWire(null);
      return;
    }
  }, [convex]);

  const isOffline = !browserOnline;
  const isSignedOut =
    browserOnline && !isAuthLoading && !isAuthenticated;

  return {
    browserOnline,
    convexConnected: convexWire?.isWebSocketConnected ?? null,
    convexHasEverConnected: convexWire?.hasEverConnected ?? null,
    isOffline,
    isSignedOut,
    isAuthenticated,
    isAuthLoading,
  };
}
