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

export function ProfileAiByokCard() {
  const { isAuthenticated } = useConvexAuth();
  const status = useQuery(api.aiByok.status, isAuthenticated ? {} : "skip");
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
        body: JSON.stringify({ apiKey }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Could not save the AI key.");
      }
      setApiKey("");
      setMessage("Saved. Chat and statement AI will use this key.");
    } catch (err: unknown) {
      setError(errorMessage(err, "Could not save the AI key."));
    } finally {
      setPending(false);
    }
  }

  async function remove() {
    setError(null);
    setMessage(null);
    setPending(true);
    try {
      const response = await fetch("/api/profile/ai-key", { method: "DELETE" });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Could not remove the AI key.");
      }
      setMessage("Removed. The app key is used if the server has one.");
    } catch (err: unknown) {
      setError(errorMessage(err, "Could not remove the AI key."));
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="space-y-4 rounded-xl border border-border bg-surface-elevated p-6">
      <h2 className="type-section flex items-center gap-2">
        Your AI key
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-accent hover:bg-accent-subtle hover:text-accent"
              aria-label="About your AI key"
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
              <PopoverTitle>Your AI key</PopoverTitle>
              <PopoverDescription>
                Optional OpenRouter key for chat, statement parse, and merchant
                clean.
              </PopoverDescription>
              <ul className="mt-1.5 list-disc space-y-1 pl-4 text-muted-foreground">
                <li>Encrypted on the server before it is stored</li>
                <li>Convex keeps ciphertext only, never the raw key</li>
                <li>If you skip this, the server can still use its own key</li>
              </ul>
            </PopoverHeader>
          </PopoverContent>
        </Popover>
      </h2>
      <p className="sr-only">
        Optional OpenRouter key. Encrypted before storage. Used instead of the
        server key when present.
      </p>

      {status?.configured && status.last4 ? (
        <p className="text-sm text-muted-foreground">
          Saved key ends in {status.last4}. Paste a new one to replace it.
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          No personal key yet.{" "}
          <a
            href="https://openrouter.ai/keys"
            target="_blank"
            rel="noreferrer"
            className="text-accent underline-offset-2 hover:underline"
          >
            Get an OpenRouter key
          </a>
        </p>
      )}

      <form className="space-y-3" onSubmit={save}>
        <label className="block space-y-2 text-sm">
          <span className="text-muted-foreground">OpenRouter API key</span>
          <input
            type="password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            autoComplete="off"
            spellCheck={false}
            placeholder="sk-or-…"
            className="w-full rounded-md border border-control-border bg-surface-elevated px-3 py-2 text-foreground outline-none focus:border-primary focus:outline-2 focus:outline-offset-1 focus:outline-ring"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <Button
            type="submit"
            disabled={pending || apiKey.trim().length === 0}
          >
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
      </form>

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
    </section>
  );
}
