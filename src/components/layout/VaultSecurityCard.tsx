"use client";

import { api } from "@convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { Download, Fingerprint, Lock, ShieldCheck, Unlock } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createRecoveryFile, downloadRecoveryFile, unwrapWithRecoveryFile } from "@/crypto/recovery";
import { createVaultKeyMaterial, unwrapMasterKey, wrapMasterKey } from "@/crypto/masterKey";
import { randomBytes } from "@/crypto/bytes";
import { DEFAULT_ARGON2_PARAMS } from "@/crypto/kdf";
import { registerPasskey, unlockWithPasskey } from "@/crypto/passkeyPrf";
import { getVaultMasterKey, lockVault, subscribeVaultSession, unlockVault } from "@/crypto/session";
import type { RecoveryFileV1 } from "@/crypto/types";

export function VaultSecurityCard() {
  const vault = useQuery(api.vaults.get, {});
  const createVault = useMutation(api.vaults.create);
  const rotateUnlockPackages = useMutation(api.vaults.rotateUnlockPackages);
  const setPasskeyPackage = useMutation(api.vaults.setPasskeyPackage);
  const [passphrase, setPassphrase] = useState("");
  const [confirmPassphrase, setConfirmPassphrase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [recoveryResetRequired, setRecoveryResetRequired] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [unlocked, setUnlocked] = useState(false);

  useEffect(() => {
    setUnlocked(Boolean(getVaultMasterKey()));
    return subscribeVaultSession(() => setUnlocked(Boolean(getVaultMasterKey())));
  }, []);

  const setSessionKey = useCallback((key: CryptoKey) => {
    unlockVault(key);
    setUnlocked(true);
  }, []);

  async function setup() {
    if (passphrase.length < 12) throw new Error("Use a vault passphrase with at least 12 characters.");
    if (passphrase !== confirmPassphrase) throw new Error("The passphrases do not match.");
    const material = await createVaultKeyMaterial(passphrase);
    const vaultId = crypto.randomUUID();
    await createVault({ vaultId, mode: "STRICT_PRIVATE", currentKeyId: crypto.randomUUID(), passphraseWrappedMasterKey: material.passphraseWrapped, passphraseSalt: material.passphraseSalt.buffer, recoveryWrappedMasterKey: material.recoveryWrapped, recoverySalt: material.recoverySalt.buffer, argon2: material.argon2 });
    downloadRecoveryFile(createRecoveryFile(vaultId, material.recoverySecret));
    setSessionKey(material.masterKey);
    setMessage("Private vault created. Store the downloaded recovery file somewhere safe.");
  }

  async function unlockWithPassphrase() {
    if (!vault) return;
    const key = await unwrapMasterKey(vault.passphraseWrappedMasterKey, passphrase, new Uint8Array(vault.passphraseSalt), vault.argon2);
    setSessionKey(key);
    setMessage("Vault unlocked on this device.");
  }

  async function addPasskey() {
    const masterKey = getVaultMasterKey();
    if (!vault || !masterKey) throw new Error("Unlock the vault before adding a passkey.");
    const packageData = await registerPasskey(masterKey, vault.vaultId);
    await setPasskeyPackage(packageData);
    setMessage("Passkey added. You can use it to unlock this vault on supported devices.");
  }

  async function unlockWithPasskeyOption() {
    if (!vault?.passkeyCredentialId || !vault.passkeyWrappedMasterKey) throw new Error("No passkey is registered for this vault.");
    setSessionKey(await unlockWithPasskey(vault.passkeyCredentialId, vault.passkeyWrappedMasterKey, vault.vaultId));
    setMessage("Vault unlocked with passkey.");
  }

  async function handleRecovery(file: File) {
    if (!vault) return;
    const parsed = JSON.parse(await file.text()) as RecoveryFileV1;
    if (parsed.vaultId !== vault.vaultId) throw new Error("That recovery file belongs to a different vault.");
    const key = await unwrapWithRecoveryFile(parsed, vault.recoveryWrappedMasterKey, new Uint8Array(vault.recoverySalt), vault.argon2);
    setSessionKey(key);
    setRecoveryResetRequired(true);
    setMessage("Recovery accepted. Choose a new vault passphrase and download a replacement recovery file.");
  }

  async function replaceRecoveryPackages() {
    if (!vault || !recoveryResetRequired) return;
    if (passphrase.length < 12 || passphrase !== confirmPassphrase) throw new Error("Enter matching passphrases with at least 12 characters.");
    const masterKey = getVaultMasterKey();
    if (!masterKey) throw new Error("Unlock the vault again before rotating recovery.");
    const passphraseSalt = randomBytes(16);
    const recoverySalt = randomBytes(16);
    const recoverySecret = randomBytes(32);
    await rotateUnlockPackages({ passphraseWrappedMasterKey: await wrapMasterKey(masterKey, passphrase, passphraseSalt), passphraseSalt: passphraseSalt.buffer, recoveryWrappedMasterKey: await wrapMasterKey(masterKey, recoverySecret, recoverySalt), recoverySalt: recoverySalt.buffer, argon2: DEFAULT_ARGON2_PARAMS });
    downloadRecoveryFile(createRecoveryFile(vault.vaultId, recoverySecret));
    setRecoveryResetRequired(false);
    setPassphrase("");
    setConfirmPassphrase("");
    setMessage("Recovery methods replaced. Store the new recovery file safely.");
  }

  async function run(task: () => Promise<void>) {
    setError(null); setMessage(null); setBusy(true);
    try { await task(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update the private vault."); } finally { setBusy(false); }
  }

  if (vault === undefined) return null;

  return (
    <section className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[var(--accent)]/10 text-[var(--accent)]"><ShieldCheck className="size-5" /></div>
          <div><h2 className="font-semibold">Private vault</h2><p className="text-sm text-[var(--muted-foreground)]">Encrypt your financial data before it reaches the server.</p></div>
        </div>
        {vault && <span className="rounded-full bg-[var(--accent)]/10 px-2.5 py-1 text-xs font-medium text-[var(--accent)]">{unlocked ? "Unlocked" : "Locked"}</span>}
      </div>
      {!vault ? (
        <>
          <p className="text-sm text-[var(--muted-foreground)]">Create a separate vault passphrase. Your account password cannot unlock private financial data. Existing ledger rows remain in the current storage until migration is completed.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm"><span className="text-[var(--muted-foreground)]">Vault passphrase</span><input type="password" value={passphrase} onChange={(event) => setPassphrase(event.target.value)} placeholder="At least 12 characters" autoComplete="new-password" className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm" /></label>
            <label className="space-y-1 text-sm"><span className="text-[var(--muted-foreground)]">Confirm passphrase</span><input type="password" value={confirmPassphrase} onChange={(event) => setConfirmPassphrase(event.target.value)} placeholder="Repeat passphrase" autoComplete="new-password" className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm" /></label>
          </div>
          <button type="button" disabled={busy} onClick={() => void run(setup)} className="inline-flex items-center gap-2 rounded-md bg-[var(--accent)] px-3 py-2 text-sm font-medium text-[var(--accent-foreground)] disabled:opacity-60"><Lock className="size-4" />{busy ? "Creating…" : "Create private vault"}</button>
        </>
      ) : recoveryResetRequired ? (
        <>
          <p className="text-sm text-[var(--muted-foreground)]">Recovery unlocked this vault. Set a new passphrase and download a replacement recovery file before continuing.</p>
          <div className="grid gap-3 sm:grid-cols-2"><label className="space-y-1 text-sm"><span className="text-[var(--muted-foreground)]">New vault passphrase</span><input type="password" value={passphrase} onChange={(event) => setPassphrase(event.target.value)} placeholder="At least 12 characters" className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm" /></label><label className="space-y-1 text-sm"><span className="text-[var(--muted-foreground)]">Confirm passphrase</span><input type="password" value={confirmPassphrase} onChange={(event) => setConfirmPassphrase(event.target.value)} placeholder="Repeat passphrase" className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm" /></label></div>
          <button type="button" disabled={busy} onClick={() => void run(replaceRecoveryPackages)} className="inline-flex items-center gap-2 rounded-md bg-[var(--accent)] px-3 py-2 text-sm font-medium text-[var(--accent-foreground)] disabled:opacity-60"><Download className="size-4" />Replace recovery methods</button>
        </>
      ) : unlocked ? (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => { lockVault(); setUnlocked(false); }} className="inline-flex items-center gap-2 rounded-md border border-[var(--border)] px-3 py-2 text-sm"><Lock className="size-4" />Lock vault</button>
          {!vault.passkeyCredentialId ? <button type="button" disabled={busy} onClick={() => void run(addPasskey)} className="inline-flex items-center gap-2 rounded-md border border-[var(--border)] px-3 py-2 text-sm disabled:opacity-60"><Fingerprint className="size-4" />Add passkey</button> : <span className="inline-flex items-center gap-2 px-2 py-2 text-sm text-[var(--muted-foreground)]"><Fingerprint className="size-4" />Passkey enabled</span>}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2"><label className="min-w-0 flex-1 space-y-1 text-sm"><span className="sr-only">Vault passphrase</span><input type="password" value={passphrase} onChange={(event) => setPassphrase(event.target.value)} placeholder="Vault passphrase" autoComplete="current-password" className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm" /></label><button type="button" disabled={busy} onClick={() => void run(unlockWithPassphrase)} className="inline-flex items-center gap-2 rounded-md bg-[var(--accent)] px-3 py-2 text-sm font-medium text-[var(--accent-foreground)] disabled:opacity-60"><Unlock className="size-4" />Unlock</button>{vault.passkeyCredentialId ? <button type="button" disabled={busy} onClick={() => void run(unlockWithPasskeyOption)} className="inline-flex items-center gap-2 rounded-md border border-[var(--border)] px-3 py-2 text-sm disabled:opacity-60"><Fingerprint className="size-4" />Use passkey</button> : null}</div>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void run(() => handleRecovery(file)); event.target.value = ""; }} />
          <button type="button" onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-2 text-sm text-[var(--accent)] hover:underline"><Download className="size-4" />Unlock with recovery file</button>
        </>
      )}
      {error && <p role="alert" className="rounded-md border border-[var(--spend)]/30 bg-[var(--spend)]/5 px-3 py-2 text-sm text-[var(--spend)]">{error}</p>}
      {message && <p className="text-sm text-[var(--muted-foreground)]">{message}</p>}
      {vault && <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-[var(--muted-foreground)]">The vault locks after 15 minutes of inactivity. Losing both your passphrase and recovery file makes the encrypted data unrecoverable.</p>{unlocked ? <Link href="/private-vault" className="shrink-0 text-sm text-[var(--accent)] underline">Open private vault</Link> : null}</div>}
    </section>
  );
}
