"use client";

import { SerwistProvider } from "@serwist/turbopack/react";
import { type ReactNode, useEffect, useState } from "react";
import { ServiceWorkerUpdateToast } from "./ServiceWorkerUpdateToast";

const APEX_HOST = "jevsbudget.app";
const WWW_HOST = "www.jevsbudget.app";

function shouldDisableServiceWorker(hostname: string) {
  if (process.env.NODE_ENV === "development") {
    return true;
  }
  if (!hostname) {
    return true;
  }
  return hostname === APEX_HOST;
}

export function SerwistAppProvider({ children }: { children: ReactNode }) {
  const [hostname, setHostname] = useState("");

  useEffect(() => {
    setHostname(window.location.hostname);
    if (window.location.hostname !== APEX_HOST) {
      return;
    }
    if (!("serviceWorker" in navigator)) {
      window.location.replace(
        `${window.location.protocol}//${WWW_HOST}${window.location.pathname}${window.location.search}${window.location.hash}`,
      );
      return;
    }
    void navigator.serviceWorker.getRegistrations().then(async (regs) => {
      await Promise.all(regs.map((reg) => reg.unregister()));
      window.location.replace(
        `${window.location.protocol}//${WWW_HOST}${window.location.pathname}${window.location.search}${window.location.hash}`,
      );
    });
  }, []);

  return (
    <SerwistProvider
      swUrl="/serwist/sw.js"
      disable={shouldDisableServiceWorker(hostname)}
      cacheOnNavigation={false}
      reloadOnOnline={false}
    >
      {children}
      <ServiceWorkerUpdateToast />
    </SerwistProvider>
  );
}
