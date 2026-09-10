import { desc } from "drizzle-orm";
import { ConnectBankButton } from "@/components/connect-bank-button";
import { SyncTransactionsButton } from "@/components/sync-transactions-button";
import { getDb } from "@/db";
import { accounts, plaidItems, transactions } from "@/db/schema";
import { formatMoney, formatPlaidSpend } from "@/lib/money";

export const dynamic = "force-dynamic";

async function loadDashboard() {
  try {
    const db = getDb();
    const [itemRows, accountRows, txnRows] = await Promise.all([
      db.select().from(plaidItems),
      db.select().from(accounts),
      db.select().from(transactions).orderBy(desc(transactions.date)).limit(40),
    ]);

    return { itemRows, accountRows, txnRows, error: null as string | null };
  } catch (error) {
    return {
      itemRows: [],
      accountRows: [],
      txnRows: [],
      error:
        error instanceof Error
          ? error.message
          : "Database unavailable. Run npm run db:push first.",
    };
  }
}

export default async function Home() {
  const { itemRows, accountRows, txnRows, error } = await loadDashboard();

  const totalBalance = accountRows.reduce(
    (sum, account) => sum + (account.currentBalance ?? 0),
    0,
  );

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-10 px-6 py-10 sm:px-10">
      <header className="flex flex-col gap-6 border-b border-[var(--border)] pb-8 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <p className="text-sm tracking-[0.18em] text-[var(--muted)] uppercase">
            Personal finance
          </p>
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
            JayrrBudget
          </h1>
          <p className="max-w-xl text-[var(--muted)]">
            Connect your banks with Plaid, keep balances and spend in a local
            SQLite database, and deploy on Vercel.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <ConnectBankButton />
          <SyncTransactionsButton />
        </div>
      </header>

      {error ? (
        <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-3">
        <Stat
          label="Linked institutions"
          value={String(itemRows.length)}
        />
        <Stat label="Accounts" value={String(accountRows.length)} />
        <Stat label="Total balance" value={formatMoney(totalBalance)} />
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">Accounts</h2>
        {accountRows.length === 0 ? (
          <EmptyState text="No accounts yet. Connect a bank with Plaid sandbox to get started." />
        ) : (
          <ul className="divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
            {accountRows.map((account) => (
              <li
                key={account.plaidAccountId}
                className="flex items-center justify-between gap-4 px-4 py-3"
              >
                <div>
                  <p className="font-medium">
                    {account.name}
                    {account.mask ? (
                      <span className="text-[var(--muted)]">
                        {" "}
                        ••{account.mask}
                      </span>
                    ) : null}
                  </p>
                  <p className="text-sm text-[var(--muted)]">
                    {[account.type, account.subtype].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <p className="font-mono text-sm">
                  {formatMoney(
                    account.currentBalance,
                    account.isoCurrencyCode ?? "USD",
                  )}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-4 pb-8">
        <h2 className="text-xl font-semibold tracking-tight">
          Recent transactions
        </h2>
        {txnRows.length === 0 ? (
          <EmptyState text="No transactions synced yet. After linking, hit Sync transactions." />
        ) : (
          <ul className="divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
            {txnRows.map((txn) => {
              const isSpend = txn.amount > 0;
              return (
                <li
                  key={txn.plaidTransactionId}
                  className="flex items-start justify-between gap-4 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {txn.merchantName ?? txn.name}
                    </p>
                    <p className="text-sm text-[var(--muted)]">
                      {txn.date}
                      {txn.categoryPrimary
                        ? ` · ${txn.categoryPrimary.replaceAll("_", " ").toLowerCase()}`
                        : ""}
                      {txn.pending ? " · pending" : ""}
                    </p>
                  </div>
                  <p
                    className={`shrink-0 font-mono text-sm ${
                      isSpend ? "text-[var(--spend)]" : "text-[var(--income)]"
                    }`}
                  >
                    {formatPlaidSpend(
                      txn.amount,
                      txn.isoCurrencyCode ?? "USD",
                    )}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-5">
      <p className="text-sm text-[var(--muted)]">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)]/70 px-4 py-8 text-sm text-[var(--muted)]">
      {text}
    </div>
  );
}
