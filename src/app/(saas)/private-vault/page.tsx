"use client";

import Link from "next/link";
import { useConvex, useConvexAuth, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "@convex/_generated/api";
import { decryptJson } from "@/crypto/envelope";
import type { EncryptedEnvelopeV1 } from "@/crypto/types";
import { getVaultMasterKey, subscribeVaultSession } from "@/crypto/session";
import { importPrivateCsv } from "@/domains/vault/application/importPrivateCsv";
import type { MutationClient } from "@/crypto/vaultRecords";

type PrivateTransaction = { date: string; description: string; amount: number; currency: string };

export default function PrivateVaultPage() {
  const { isAuthenticated } = useConvexAuth();
  const client = useConvex();
  const me = useQuery(api.users.me, isAuthenticated ? {} : "skip");
  const vault = useQuery(api.vaults.get, isAuthenticated ? {} : "skip");
  const rows = useQuery(api.vaults.listRecords, vault ? { vaultId: vault.vaultId, paginationOpts: { numItems: 100, cursor: null } } : "skip");
  const [unlocked, setUnlocked] = useState(Boolean(getVaultMasterKey()));
  const [transactions, setTransactions] = useState<PrivateTransaction[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setUnlocked(Boolean(getVaultMasterKey()));
    return subscribeVaultSession(() => setUnlocked(Boolean(getVaultMasterKey())));
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadRows() {
      const key = getVaultMasterKey();
      if (!key || !rows?.page || !me) { setTransactions([]); return; }
      const next: PrivateTransaction[] = [];
      for (const row of rows.page) {
        if (row.deleted) continue;
        try { next.push(await decryptJson<PrivateTransaction>(row as EncryptedEnvelopeV1, { userId: String(me.userId), recordId: row.recordId, kind: row.kind as "tx", keyId: row.keyId }, key)); } catch { /* A stale key must not break the private view. */ }
      }
      if (!cancelled) setTransactions(next);
    }
    void loadRows();
    return () => { cancelled = true; };
  }, [me, rows, unlocked]);

  async function upload(file: File) {
    const key = getVaultMasterKey();
    if (!vault || !me || !key) throw new Error("Unlock the private vault from your profile first.");
    setBusy(true); setError(null); setMessage(null);
    try {
      await importPrivateCsv(client as unknown as MutationClient, { userId: String(me.userId), vaultId: vault.vaultId, keyId: vault.currentKeyId, masterKey: key, file });
      setMessage("CSV imported and encrypted in your browser before upload.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not import CSV."); } finally { setBusy(false); }
  }

  if (!vault) return <div className="mx-auto max-w-2xl space-y-4"><h1 className="text-3xl font-semibold">Private vault</h1><p className="text-[var(--muted-foreground)]">Create your private vault from the <Link className="text-[var(--accent)] underline" href="/profile">profile page</Link> first.</p></div>;
  return <div className="mx-auto max-w-3xl space-y-8">
    <header className="space-y-1 border-b border-[var(--border)] pb-6"><h1 className="text-3xl font-semibold">Private vault</h1><p className="text-[var(--muted-foreground)]">Transactions on this page are decrypted in your browser. CSV import encrypts readable rows before they reach the server.</p></header>
    {!unlocked ? <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"><p className="text-sm text-[var(--muted-foreground)]">Your vault is locked. Unlock it from the <Link className="text-[var(--accent)] underline" href="/profile">profile page</Link> to view or import private transactions.</p></div> : <>
      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Local CSV import</h2><p className="text-sm text-[var(--muted-foreground)]">Date, description, and amount columns are required.</p></div><label className="cursor-pointer rounded-md bg-[var(--accent)] px-3 py-2 text-sm font-medium text-[var(--accent-foreground)]">{busy ? "Encrypting…" : "Choose CSV"}<input type="file" accept=".csv,text/csv" className="hidden" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); event.target.value = ""; }} /></label></div></section>
      {transactions.length ? <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]"><div className="border-b border-[var(--border)] px-5 py-4"><h2 className="font-semibold">Private transactions</h2></div><div className="divide-y divide-[var(--border)]">{transactions.map((transaction, index) => <div key={`${transaction.date}-${index}`} className="flex items-center justify-between gap-4 px-5 py-3"><div><p className="font-medium">{transaction.description}</p><p className="text-sm text-[var(--muted-foreground)]">{transaction.date} · {transaction.currency}</p></div><span className="font-mono text-sm">{transaction.amount.toFixed(2)} {transaction.currency}</span></div>)}</div></section> : <p className="text-sm text-[var(--muted-foreground)]">No encrypted transactions yet.</p>}
    </>}
    {error && <p role="alert" className="rounded-md border border-[var(--spend)]/30 bg-[var(--spend)]/5 px-3 py-2 text-sm text-[var(--spend)]">{error}</p>}{message && <p className="text-sm text-[var(--muted-foreground)]">{message}</p>}
  </div>;
}
