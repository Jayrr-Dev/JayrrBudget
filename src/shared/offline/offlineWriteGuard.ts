"use client";

import type { ConvexReactClient } from "convex/react";
import { toast } from "sonner";
import { isFullyLocal } from "@/shared/offline/fullyLocalMode";

export const OFFLINE_WRITE_TOAST =
  "You're offline. Try again when you're connected.";

export function isBrowserOffline() {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

/** Toast and return true when the browser has no network. */
export function toastIfOffline(): boolean {
  if (!isBrowserOffline()) return false;
  toast.error(OFFLINE_WRITE_TOAST);
  return true;
}

/** Fail closed: toast, then throw. No queued sync. Fully local writes stay on device. */
export function assertOnlineForWrite() {
  if (isFullyLocal()) return;
  if (toastIfOffline()) {
    throw new Error(OFFLINE_WRITE_TOAST);
  }
}

/** Block Convex mutations and actions while `navigator.onLine` is false. */
export function installConvexOfflineWriteGuard(client: ConvexReactClient) {
  const mutation = client.mutation.bind(client);
  const action = client.action.bind(client);
  client.mutation = ((...args: unknown[]) => {
    if (isBrowserOffline()) {
      toast.error(OFFLINE_WRITE_TOAST);
      return Promise.reject(new Error(OFFLINE_WRITE_TOAST));
    }
    return (
      mutation as (...a: unknown[]) => ReturnType<ConvexReactClient["mutation"]>
    )(...args);
  }) as ConvexReactClient["mutation"];
  client.action = ((...args: unknown[]) => {
    if (isBrowserOffline()) {
      toast.error(OFFLINE_WRITE_TOAST);
      return Promise.reject(new Error(OFFLINE_WRITE_TOAST));
    }
    return (
      action as (...a: unknown[]) => ReturnType<ConvexReactClient["action"]>
    )(...args);
  }) as ConvexReactClient["action"];
}
