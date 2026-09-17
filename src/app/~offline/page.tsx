"use client";

import OverviewPage from "@/app/(saas)/page";
import { AppShell } from "@/components/layout/AppShell";

export default function OfflineFallbackPage() {
  return (
    <AppShell>
      <h1 className="sr-only">Offline last view</h1>
      <p className="sr-only">
        Showing the dashboard last loaded while you were online. Uploads and
        edits wait until you reconnect.
      </p>
      <OverviewPage />
    </AppShell>
  );
}
