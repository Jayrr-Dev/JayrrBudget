"use client";

import { api } from "@convex/_generated/api";
import { useConvex, useMutation, useQuery } from "convex/react";
import { Download, Fingerprint, Info, Lock, ShieldCheck, Unlock } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useCallback, useEffect, useRef, useState } from "react";
import { registerPasskey, unlockWithPasskey } from "@/crypto/passkeyPrf";
import { rememberDeviceUnlock } from "@/crypto/deviceUnlock";
import { clearPendingPasscode, peekPendingPasscode } from "@/crypto/pendingPasscode";
import { unwrapWithRecoveryFile } from "@/crypto/recovery";
import { getVaultMasterKey, subscribeVaultSession } from "@/crypto/session";
import type { RecoveryFileV1 } from "@/crypto/types";
import {
  commitVaultUnlock,
  createVaultWithPasscode,
  MIN_PASSCODE_LENGTH,
  relinkVaultPasscode,
  unlockVaultWithPasscode,
  type VaultClient,
  type VaultUnlockRecord,
} from "@/domains/vault/application/ensureVaultFromPasscode";

export function VaultSecurityCard() {
  const client = useConvex();
  const vault = useQuery(api.vaults.get, {});
  const setPasskeyPackage = useMutation(api.vaults.setPasskeyPackage);
  const [passcode, setPasscode] = useState("");
  const [legacyPasscode, setLegacyPasscode] = useState("");
  const [showLegacy, setShowLegacy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [needsPasscodeLink, setNeedsPasscodeLink] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [unlocked, setUnlocked] = useState(false);
  const vaultClient = client as unknown as VaultClient;

  useEffect(() => {
    setUnlocked(Boolean(getVaultMasterKey()));
    return subscribeVaultSession(() => setUnlocked(Boolean(getVaultMasterKey())));
  }, []);

  useEffect(() => {
    const key = getVaultMasterKey();
    if (!vault || !key) return;
    void rememberDeviceUnlock(vault.vaultId, key);
  }, [unlocked, vault]);

  const finishLink = useCallback(async (record: VaultUnlockRecord, nextPasscode: string) => {
    const masterKey = getVaultMasterKey();
    if (!masterKey) throw new Error("Sign in again before linking your password.");
    await relinkVaultPasscode(vaultClient, record, masterKey, nextPasscode);
    clearPendingPasscode();
    setNeedsPasscodeLink(false);
    setPasscode("");
    setLegacyPasscode("");
    setMessage("Vault now uses your sign-in password.");
  }, [vaultClient]);

  async function setup() {
    if (!passcode) throw new Error("Enter the same password you use to sign in.");
    await createVaultWithPasscode(vaultClient, passcode);
    clearPendingPasscode();
    setPasscode("");
    setMessage("Encryption is on. Store the downloaded recovery file somewhere safe.");
  }

  async function unlockWithPassword() {
    if (!vault) return;
    const ok = await unlockVaultWithPasscode(vault, passcode);
    if (!ok) throw new Error("That password did not unlock the vault. Try your sign-in password, an older vault passcode, or the recovery file.");
    clearPendingPasscode();
    setPasscode("");
    setMessage("Vault unlocked.");
  }

  async function unlockWithLegacyPasscode() {
    if (!vault) return;
    const ok = await unlockVaultWithPasscode(vault, legacyPasscode);
    if (!ok) throw new Error("That older vault passcode did not work.");
    const pending = peekPendingPasscode();
    if (pending) {
      await finishLink(vault, pending);
      return;
    }
    setNeedsPasscodeLink(true);
    setMessage("Unlocked with the old vault passcode. Enter your current sign-in password to finish.");
  }

  async function linkCurrentPassword() {
    if (!vault) return;
    await finishLink(vault, passcode);
  }

  async function addPasskey() {
    const masterKey = getVaultMasterKey();
    if (!vault || !masterKey) throw new Error("Sign in again before adding a passkey.");
    const packageData = await registerPasskey(masterKey, vault.vaultId);
    await setPasskeyPackage(packageData);
    setMessage("Passkey added. You can use it to unlock this vault on supported devices.");
  }

  async function unlockWithPasskeyOption() {
    if (!vault?.passkeyCredentialId || !vault.passkeyWrappedMasterKey) throw new Error("No passkey is registered for this vault.");
    await commitVaultUnlock(vault.vaultId, await unlockWithPasskey(vault.passkeyCredentialId, vault.passkeyWrappedMasterKey, vault.vaultId));
    const pending = peekPendingPasscode();
    if (pending) {
      await finishLink(vault, pending);
      return;
    }
    setMessage("Vault unlocked with passkey.");
  }

  async function handleRecovery(file: File) {
    if (!vault) return;
    const parsed = JSON.parse(await file.text()) as RecoveryFileV1;
    if (parsed.vaultId !== vault.vaultId) throw new Error("That recovery file belongs to a different vault.");
    await commitVaultUnlock(vault.vaultId, await unwrapWithRecoveryFile(parsed, vault.recoveryWrappedMasterKey, new Uint8Array(vault.recoverySalt), vault.argon2));
    const pending = peekPendingPasscode();
    if (pending) {
      await finishLink(vault, pending);
      return;
    }
    setNeedsPasscodeLink(true);
    setMessage("Recovery accepted. Enter your current sign-in password so the next login unlocks the vault.");
  }

  async function run(task: () => Promise<void>) {
    setError(null);
    setMessage(null);
    setBusy(true);
    try {
      await task();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update encryption settings.");
    } finally {
      setBusy(false);
    }
  }

  if (vault === undefined) return null;

  return (
    <section className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[var(--accent)]/10 text-[var(--accent)]"><ShieldCheck className="size-5" /></div>
          <div>
            <h2 className="flex items-center gap-2 font-semibold">
              Encryption
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label="About encryption"
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
                    <PopoverTitle>Your ledger is encrypted</PopoverTitle>
                    <PopoverDescription className="leading-relaxed">
                      Your password encrypts the numbers. Only you can read
                      them. We cannot.
                    </PopoverDescription>
                  </PopoverHeader>
                </PopoverContent>
              </Popover>
            </h2>
          </div>
        </div>
        {vault ? <span className="rounded-full bg-[var(--accent)]/10 px-2.5 py-1 text-xs font-medium text-[var(--accent)]">{unlocked ? "Unlocked" : "Locked"}</span> : null}
      </div>
      {!vault ? (
        <>
          <p className="text-sm text-[var(--muted-foreground)]">Sign in normally and encryption is created automatically. If it did not, type that same password here.</p>
          <label className="block space-y-1 text-sm">
            <span className="text-[var(--muted-foreground)]">Sign-in password</span>
            <input type="password" value={passcode} onChange={(event) => setPasscode(event.target.value)} placeholder={`At least ${MIN_PASSCODE_LENGTH} characters`} autoComplete="current-password" className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm" />
          </label>
          <button type="button" disabled={busy} onClick={() => void run(setup)} className="inline-flex items-center gap-2 rounded-md bg-[var(--accent)] px-3 py-2 text-sm font-medium text-[var(--accent-foreground)] disabled:opacity-60"><Lock className="size-4" />{busy ? "Creating…" : "Set up encryption"}</button>
        </>
      ) : needsPasscodeLink ? (
        <>
          <p className="text-sm text-[var(--muted-foreground)]">Type your current sign-in password so the next login opens the ledger automatically.</p>
          <label className="block space-y-1 text-sm">
            <span className="text-[var(--muted-foreground)]">Current sign-in password</span>
            <input type="password" value={passcode} onChange={(event) => setPasscode(event.target.value)} autoComplete="current-password" className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm" />
          </label>
          <button type="button" disabled={busy} onClick={() => void run(linkCurrentPassword)} className="inline-flex items-center gap-2 rounded-md bg-[var(--accent)] px-3 py-2 text-sm font-medium text-[var(--accent-foreground)] disabled:opacity-60"><Download className="size-4" />Save password as vault passcode</button>
        </>
      ) : unlocked ? (
        <div className="flex flex-wrap gap-2">
          {!vault.passkeyCredentialId ? <button type="button" disabled={busy} onClick={() => void run(addPasskey)} className="inline-flex items-center gap-2 rounded-md border border-[var(--border)] px-3 py-2 text-sm disabled:opacity-60"><Fingerprint className="size-4" />Add passkey</button> : <span className="inline-flex items-center gap-2 px-2 py-2 text-sm text-[var(--muted-foreground)]"><Fingerprint className="size-4" />Passkey enabled</span>}
        </div>
      ) : (
        <>
          <p className="text-sm text-[var(--muted-foreground)]">Use the same password you sign in with. A reset on this browser re-keys the vault by itself after you have unlocked here once.</p>
          <div className="flex flex-wrap gap-2">
            <label className="min-w-0 flex-1 space-y-1 text-sm">
              <span className="sr-only">Sign-in password</span>
              <input type="password" value={passcode} onChange={(event) => setPasscode(event.target.value)} placeholder="Sign-in password" autoComplete="current-password" className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm" />
            </label>
            <button type="button" disabled={busy} onClick={() => void run(unlockWithPassword)} className="inline-flex items-center gap-2 rounded-md bg-[var(--accent)] px-3 py-2 text-sm font-medium text-[var(--accent-foreground)] disabled:opacity-60"><Unlock className="size-4" />Unlock</button>
            {vault.passkeyCredentialId ? <button type="button" disabled={busy} onClick={() => void run(unlockWithPasskeyOption)} className="inline-flex items-center gap-2 rounded-md border border-[var(--border)] px-3 py-2 text-sm disabled:opacity-60"><Fingerprint className="size-4" />Use passkey</button> : null}
          </div>
          <div className="flex flex-col items-start gap-2">
            {showLegacy ? (
              <div className="flex w-full flex-wrap gap-2">
                <label className="min-w-0 flex-1 space-y-1 text-sm">
                  <span className="sr-only">Older vault passcode</span>
                  <input type="password" value={legacyPasscode} onChange={(event) => setLegacyPasscode(event.target.value)} placeholder="Older vault passcode" className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm" />
                </label>
                <button type="button" disabled={busy} onClick={() => void run(unlockWithLegacyPasscode)} className="inline-flex items-center gap-2 rounded-md border border-[var(--border)] px-3 py-2 text-sm disabled:opacity-60">Unlock with old passcode</button>
              </div>
            ) : (
              <button type="button" className="text-left text-sm text-[var(--accent)] hover:underline" onClick={() => setShowLegacy(true)}>I used a separate vault passcode before</button>
            )}
            <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void run(() => handleRecovery(file)); event.target.value = ""; }} />
            <button type="button" onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-2 text-sm text-[var(--accent)] hover:underline"><Download className="size-4" />Unlock with recovery file</button>
          </div>
        </>
      )}
      {error ? <p role="alert" className="rounded-md border border-[var(--spend)]/30 bg-[var(--spend)]/5 px-3 py-2 text-sm text-[var(--spend)]">{error}</p> : null}
      {message ? <p className="text-sm text-[var(--muted-foreground)]">{message}</p> : null}
      {vault ? <p className="text-xs text-[var(--muted-foreground)]">This browser can reopen the ledger after a password reset. A new browser still needs the recovery file. Losing password, recovery file, and this browser makes the data unrecoverable.</p> : null}
    </section>
  );
}
