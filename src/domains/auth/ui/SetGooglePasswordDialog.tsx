"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { setPendingPasscode } from "@/crypto/pendingPasscode";
import { MIN_PASSCODE_LENGTH } from "@/domains/vault/application/ensureVaultFromPasscode";
import { api } from "@convex/_generated/api";
import { useAction, useConvexAuth, useQuery } from "convex/react";
import { Info } from "lucide-react";
import { useState } from "react";

const FIELD_CLASS =
  "min-h-11 w-full rounded-md border border-control-border bg-surface-elevated px-3 py-2 text-base text-foreground outline-none focus:border-primary focus:outline-2 focus:outline-offset-1 focus:outline-ring";

function keepDialogOpen() {
  return;
}

function blockDismiss(event: { preventDefault: () => void }) {
  event.preventDefault();
}

function setupError(error: unknown) {
  const raw =
    error instanceof Error ? error.message : "Could not save the password.";
  const marker = "Uncaught Error: ";
  const index = raw.lastIndexOf(marker);
  if (index === -1) return raw;
  return raw.slice(index + marker.length);
}

export function SetGooglePasswordDialog() {
  const { isAuthenticated } = useConvexAuth();
  const needsPassword = useQuery(
    api.passwordSetup.needsPasswordSetup,
    isAuthenticated ? {} : "skip",
  );
  const setInitialPassword = useAction(api.passwordSetup.setInitialPassword);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);

  if (needsPassword !== true) return null;
  if (saved) return null;

  return (
    <Dialog open onOpenChange={keepDialogOpen}>
      <DialogContent
        className="sm:max-w-md"
        showCloseButton={false}
        showMaximizeButton={false}
        showMinimizeButton={false}
        onPointerDownOutside={blockDismiss}
        onInteractOutside={blockDismiss}
        onEscapeKeyDown={blockDismiss}
        onFocusOutside={blockDismiss}
      >
        <DialogHeader className="pr-0">
          <div className="flex items-center gap-2">
            <DialogTitle>Set a password</DialogTitle>
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-accent hover:text-primary sm:size-6"
                  aria-label="Why a password is required"
                >
                  <Info className="size-3.5" />
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="start"
                side="bottom"
                sideOffset={8}
                className="w-80 max-w-[calc(100vw-2rem)] gap-0 p-3.5"
              >
                <PopoverHeader className="gap-1.5">
                  <PopoverTitle>Set a password</PopoverTitle>
                  <PopoverDescription>
                    This password is the other way to sign in.
                  </PopoverDescription>
                  <ul className="mt-1.5 list-disc space-y-1 pl-4 text-muted-foreground">
                    <li>It also encrypts your ledger on this device</li>
                    <li>Use at least 8 characters</li>
                    <li>Google sign-in still works after this</li>
                  </ul>
                </PopoverHeader>
              </PopoverContent>
            </Popover>
          </div>
          <DialogDescription className="sr-only">
            Set a password for this Google account. It also encrypts your
            ledger. You cannot skip this step.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            setError(null);
            if (password !== confirm) {
              setError("Passwords do not match.");
              return;
            }
            if (password.length < MIN_PASSCODE_LENGTH) {
              setError(
                `Use a password with at least ${MIN_PASSCODE_LENGTH} characters.`,
              );
              return;
            }
            setPending(true);
            void setInitialPassword({ password })
              .then(() => {
                setPendingPasscode(password);
                setSaved(true);
              })
              .catch((err: unknown) => {
                setError(setupError(err));
              })
              .finally(() => setPending(false));
          }}
        >
          <label className="block space-y-2 text-sm">
            <span className="text-muted-foreground">Password</span>
            <input
              type="password"
              required
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className={FIELD_CLASS}
            />
          </label>
          <label className="block space-y-2 text-sm">
            <span className="text-muted-foreground">Confirm password</span>
            <input
              type="password"
              required
              autoComplete="new-password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              className={FIELD_CLASS}
            />
          </label>
          {error !== null ? (
            <p
              className="rounded-md border border-danger/30 bg-danger-subtle px-3 py-2 text-sm text-danger"
              role="alert"
            >
              {error}
            </p>
          ) : null}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Saving…" : "Save password"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
