"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function SyncTransactionsButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function onSync() {
    setBusy(true);
    setMessage(null);

    try {
      const response = await fetch("/api/plaid/sync-transactions", {
        method: "POST",
      });
      const data = (await response.json()) as {
        error?: string;
        added?: number;
        modified?: number;
        removed?: number;
        message?: string;
      };

      if (!response.ok) {
        throw new Error(data.error ?? "Sync failed");
      }

      if (data.message) {
        setMessage(data.message);
      } else {
        setMessage(
          `Synced +${data.added ?? 0} / ~${data.modified ?? 0} / -${data.removed ?? 0}`,
        );
      }

      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Sync failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        onClick={() => void onSync()}
        disabled={busy}
        className="rounded-lg border border-[var(--border)] bg-transparent px-4 py-2.5 text-sm font-medium transition hover:bg-[var(--surface-2)] disabled:opacity-50"
      >
        {busy ? "Syncing…" : "Sync transactions"}
      </button>
      {message ? (
        <p className="text-sm text-[var(--muted)]">{message}</p>
      ) : null}
    </div>
  );
}
