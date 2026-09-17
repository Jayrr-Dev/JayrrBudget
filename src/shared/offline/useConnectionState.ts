"use client";

import { useConvex, useConvexAuth } from "convex/react";
import { useEffect, useState } from "react";

type ConvexWire = {
  isWebSocketConnected: boolean;
  hasEverConnected: boolean;
};

function readBrowserOnline() {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

/**
 * Browser online flag plus Convex websocket, if the client exposes it.
 * Offline is not the same as signed out: Convex auth is false whenever the
 * socket cannot connect, including airplane mode with a still-valid cookie.
 */
export function useConnectionState() {
  const { isAuthenticated, isLoading: isAuthLoading } = useConvexAuth();
  const convex = useConvex();
  const [browserOnline, setBrowserOnline] = useState(readBrowserOnline);
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
    const onOnline = () => setBrowserOnline(true);
    const onOffline = () => setBrowserOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    setBrowserOnline(readBrowserOnline());
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

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
