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
import {
  changePasswordKeepingVault,
  type PasswordClient,
} from "@/domains/auth/application/changePasswordKeepingVault";
import { api } from "@convex/_generated/api";
import { useConvex, useConvexAuth, useQuery } from "convex/react";
import { Info } from "lucide-react";
import { useState, type FormEvent } from "react";

const FIELD_CLASS =
  "min-h-11 w-full rounded-md border border-control-border bg-surface-elevated px-3 py-2 text-base text-foreground outline-none focus:border-primary focus:outline-2 focus:outline-offset-1 focus:outline-ring sm:text-sm";

export function ChangePasswordCard() {
  const { isAuthenticated } = useConvexAuth();
  const hasPassword = useQuery(
    api.passwordSetup.hasPassword,
    isAuthenticated ? {} : "skip",
  );
  const client = useConvex();
  const [currentPassword, setCurrentPassword] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    if (nextPassword !== confirmPassword) {
      setError("New password and confirmation do not match.");
      return;
    }
    setPending(true);
    try {
      await changePasswordKeepingVault(
        client as unknown as PasswordClient,
        currentPassword,
        nextPassword,
      );
      setCurrentPassword("");
      setNextPassword("");
      setConfirmPassword("");
      setSaved(true);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Could not change the password.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
      <h2 className="flex items-center gap-2 font-semibold">
        Password
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-accent hover:text-primary"
              aria-label="About password change"
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
              <PopoverTitle>Change password</PopoverTitle>
              <PopoverDescription>
                The new password opens the same ledger.
              </PopoverDescription>
              <ul className="mt-1.5 list-disc space-y-1 pl-4 text-muted-foreground">
                <li>Saved rows stay encrypted with the same key</li>
                <li>Only the password wrapper is replaced</li>
                <li>Current password must be the one that opens the ledger</li>
              </ul>
            </PopoverHeader>
          </PopoverContent>
        </Popover>
      </h2>
      <p className="sr-only">
        Change the password that signs you in and opens the ledger. Existing
        encrypted rows stay under the same key.
      </p>

      {hasPassword === undefined ? null : hasPassword === false ? (
        <p className="text-sm text-[var(--muted-foreground)]">
          This sign-in has no password to change.
        </p>
      ) : (
        <form className="space-y-4" onSubmit={(event) => void submit(event)}>
          <label className="block space-y-2 text-sm">
            <span className="text-[var(--muted-foreground)]">
              Current password
            </span>
            <input
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              autoComplete="current-password"
              required
              className={FIELD_CLASS}
            />
          </label>
          <label className="block space-y-2 text-sm">
            <span className="text-[var(--muted-foreground)]">New password</span>
            <input
              type="password"
              value={nextPassword}
              onChange={(event) => setNextPassword(event.target.value)}
              autoComplete="new-password"
              required
              minLength={8}
              className={FIELD_CLASS}
            />
          </label>
          <label className="block space-y-2 text-sm">
            <span className="text-[var(--muted-foreground)]">
              Confirm new password
            </span>
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
              required
              minLength={8}
              className={FIELD_CLASS}
            />
          </label>
          {error ? (
            <p
              className="rounded-md border border-danger/30 bg-danger-subtle px-3 py-2 text-sm text-danger"
              role="alert"
            >
              {error}
            </p>
          ) : null}
          {saved ? (
            <p className="text-sm text-[var(--muted-foreground)]">
              Password updated. Your ledger is unchanged.
            </p>
          ) : null}
          <Button type="submit" disabled={pending}>
            {pending ? "Updating…" : "Change password"}
          </Button>
        </form>
      )}
    </section>
  );
}
