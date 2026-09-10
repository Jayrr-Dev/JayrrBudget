"use client";

import { useCallback, useEffect, useState } from "react";
import {
  usePlaidLink,
  type PlaidLinkOnSuccess,
  type PlaidLinkOnSuccessMetadata,
} from "react-plaid-link";
import { Button } from "@/components/ui/button";

type Props = {
  label?: string;
  onLinked?: () => void | Promise<void>;
};

export function ConnectBankButton({
  label = "Connect bank",
  onLinked,
}: Props) {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);

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
          code?: string;
        };

        if (!response.ok) {
          if (data.code === "PLAID_NOT_CONFIGURED") {
            if (!cancelled) setNeedsSetup(true);
            return;
          }
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

  if (needsSetup) {
    return (
      <Button
        type="button"
        disabled
        title="Add PLAID_CLIENT_ID and PLAID_SECRET to .env.local, then restart npm run dev"
      >
        Connect bank
      </Button>
    );
  }

  if (error) {
    return (
      <Button type="button" variant="outline" disabled title={error}>
        Plaid error
      </Button>
    );
  }

  if (!linkToken) {
    return (
      <Button type="button" disabled>
        Preparing…
      </Button>
    );
  }

  return (
    <PlaidConnectButton
      label={label}
      linkToken={linkToken}
      onLinked={onLinked}
    />
  );
}

function PlaidConnectButton({
  label,
  linkToken,
  onLinked,
}: {
  label: string;
  linkToken: string;
  onLinked?: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

        await onLinked?.();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Link failed");
      } finally {
        setBusy(false);
      }
    },
    [onLinked],
  );

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess,
  });

  return (
    <Button
      type="button"
      disabled={!ready || busy}
      title={error ?? undefined}
      onClick={() => open()}
    >
      {busy ? "Connecting…" : error ? "Retry connect" : label}
    </Button>
  );
}
