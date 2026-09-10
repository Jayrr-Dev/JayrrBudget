"use client";

import { useCallback, useEffect, useState } from "react";
import {
  usePlaidLink,
  type PlaidLinkOnSuccess,
  type PlaidLinkOnSuccessMetadata,
} from "react-plaid-link";
import { useRouter } from "next/navigation";

type Props = {
  label?: string;
};

export function ConnectBankButton({ label = "Connect bank" }: Props) {
  const router = useRouter();
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadToken() {
      try {
        const response = await fetch("/api/plaid/create-link-token", {
          method: "POST",
        });
        const data = (await response.json()) as {
          link_token?: string;
          error?: string;
        };

        if (!response.ok) {
          throw new Error(data.error ?? "Could not create link token");
        }

        if (!cancelled) {
          setLinkToken(data.link_token ?? null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Plaid setup failed");
        }
      }
    }

    void loadToken();

    return () => {
      cancelled = true;
    };
  }, []);

  const onSuccess = useCallback<PlaidLinkOnSuccess>(
    async (publicToken, metadata: PlaidLinkOnSuccessMetadata) => {
      if (!publicToken) {
        setError("Plaid did not return a public token");
        return;
      }

      setBusy(true);
      setError(null);

      try {
        const exchange = await fetch("/api/plaid/exchange-public-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            public_token: publicToken,
            institution: metadata.institution
              ? {
                  institution_id: metadata.institution.institution_id,
                  name: metadata.institution.name,
                }
              : undefined,
          }),
        });

        const exchangeData = (await exchange.json()) as { error?: string };
        if (!exchange.ok) {
          throw new Error(exchangeData.error ?? "Token exchange failed");
        }

        const sync = await fetch("/api/plaid/sync-transactions", {
          method: "POST",
        });
        const syncData = (await sync.json()) as { error?: string };
        if (!sync.ok) {
          throw new Error(syncData.error ?? "Transaction sync failed");
        }

        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Link failed");
      } finally {
        setBusy(false);
      }
    },
    [router],
  );

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess,
  });

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        onClick={() => open()}
        disabled={!ready || busy || !linkToken}
        className="rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-[var(--accent-fg)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? "Connecting…" : label}
      </button>
      {error ? (
        <p className="max-w-md text-sm text-red-700">{error}</p>
      ) : null}
    </div>
  );
}
