"use client";

import { SerwistProvider } from "@serwist/turbopack/react";
import type { ReactNode } from "react";
import { ServiceWorkerUpdateToast } from "./ServiceWorkerUpdateToast";

const disableServiceWorker = process.env.NODE_ENV === "development";

export function SerwistAppProvider({ children }: { children: ReactNode }) {
  return (
    <SerwistProvider
      swUrl="/serwist/sw.js"
      disable={disableServiceWorker}
      cacheOnNavigation={false}
      reloadOnOnline={false}
    >
      {children}
      <ServiceWorkerUpdateToast />
    </SerwistProvider>
  );
}
