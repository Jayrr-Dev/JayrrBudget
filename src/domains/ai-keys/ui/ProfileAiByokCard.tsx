"use client";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { errorMessage } from "@/shared/lib/error-message";
import { api } from "@convex/_generated/api";
import { useConvexAuth, useQuery } from "convex/react";
import { Info } from "lucide-react";
import { useState, type FormEvent } from "react";

type Provider = "openrouter" | "jev";

const COPY: Record<
  Provider,
  {
    label: string;
    placeholder: string;
    empty: string;
    href: string;
    hrefLabel: string;
    saved: string;
    removed: string;
  }
> = {
  openrouter: {
    label: "OpenRouter API key",
    placeholder: "sk-or-…",
    empty: "No personal OpenRouter key yet.",
    href: "https://openrouter.ai/keys",
    hrefLabel: "Get an OpenRouter key",
    saved: "Saved. Chat and statement AI will use this key.",
    removed: "Removed. The app key is used if the server has one.",
  },
  jev: {
    label: "Jev API key",
    placeholder: "Paste your TypeSafe key",
    empty: "No personal Jev key yet.",
    href: "https://console.typesafe.ai",
    hrefLabel: "Get a Jev key",
    saved: "Saved. Categorize, statement signs, and Piggy votes will use this key.",
    removed: "Removed. The app key is used if the server has one.",
  },
};

export function ProfileAiByokCard() {
  const { isAuthenticated } = useConvexAuth();
  const openrouter = useQuery(
    api.aiByok.status,
    isAuthenticated ? { provider: "openrouter" } : "skip",
  );
  const jev = useQuery(
    api.aiByok.status,
    isAuthenticated ? { provider: "jev" } : "skip",
  );

  return (
    <section className="space-y-4 rounded-xl border border-border bg-surface-elevated p-6">
      <h2 className="type-section flex items-center gap-2">
        Your AI keys
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-accent hover:text-primary"
              aria-label="About your AI keys"
            >
              <Info className="size-3.5" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            side="bottom"
            sideOffset={8}
            className="w-80 gap-0 p-3.5"
          >
            <PopoverHeader className="gap-1.5">
              <PopoverTitle>Your AI keys</PopoverTitle>
              <PopoverDescription>
                Optional keys so chat and Jev bill your account.
              </PopoverDescription>
              <ul className="mt-1.5 list-disc space-y-1 pl-4 text-muted-foreground">
                <li>Encrypted on the server before anything is stored</li>
                <li>Convex keeps ciphertext only, never the raw key</li>
                <li>Tied to your account, so another user cannot decrypt it</li>
                <li>After save, the page only shows the last 4 characters</li>
                <li>Skip either key and the server uses its own, if it has one</li>
              </ul>
            </PopoverHeader>
          </PopoverContent>
        </Popover>
      </h2>
      <p className="sr-only">
        Optional OpenRouter and Jev keys. Each is encrypted before storage and
        used instead of the server key when present.
      </p>

      <KeyForm provider="openrouter" status={openrouter} />
      <KeyForm provider="jev" status={jev} />
    </section>
  );
}

function KeyForm({
  provider,
  status,
}: {
  provider: Provider;
  status: { configured: boolean; last4: string | null } | undefined;
}) {
  const copy = COPY[provider];
  const savedLast4 = status?.configured ? status.last4 : null;
  const [apiKey, setApiKey] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function save(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setPending(true);
    try {
      const response = await fetch("/api/profile/ai-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey, provider }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Could not save the key.");
      }
      setApiKey("");
      setMessage(copy.saved);
    } catch (err: unknown) {
      setError(errorMessage(err, "Could not save the key."));
    } finally {
      setPending(false);
    }
  }

  async function remove() {
    setError(null);
    setMessage(null);
    setPending(true);
    try {
      const response = await fetch(
        `/api/profile/ai-key?provider=${provider}`,
        { method: "DELETE" },
      );
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Could not remove the key.");
      }
      setMessage(copy.removed);
    } catch (err: unknown) {
      setError(errorMessage(err, "Could not remove the key."));
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      className={
        provider === "jev"
          ? "space-y-3 border-t border-border pt-4"
          : "space-y-3"
      }
      onSubmit={save}
    >
      {savedLast4 ? (
        <p className="text-sm text-muted-foreground">
          Saved key ends in {savedLast4}. Paste a new one to replace it.
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          {copy.empty}{" "}
          <a
            href={copy.href}
            target="_blank"
            rel="noreferrer"
            className="text-accent underline-offset-2 hover:underline"
          >
            {copy.hrefLabel}
          </a>
        </p>
      )}

      <label className="block space-y-2 text-sm">
        <span className="text-muted-foreground">{copy.label}</span>
        <input
          type="password"
          name={`${provider}-api-key`}
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
          autoComplete="off"
          spellCheck={false}
          placeholder={copy.placeholder}
          className="w-full rounded-md border border-control-border bg-surface-elevated px-3 py-2 text-foreground outline-none focus:border-primary focus:outline-2 focus:outline-offset-1 focus:outline-ring"
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending || apiKey.trim().length === 0}>
          {pending ? "Saving…" : "Save key"}
        </Button>
        {status?.configured ? (
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => void remove()}
          >
            Remove
          </Button>
        ) : null}
      </div>

      {error ? (
        <p
          className="rounded-md border border-danger/30 bg-danger-subtle px-3 py-2 text-sm text-danger"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="text-sm text-muted-foreground">{message}</p>
      ) : null}
    </form>
  );
}
