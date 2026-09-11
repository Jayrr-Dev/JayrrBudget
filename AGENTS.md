<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Database (Turso only) — agent context

**Source of truth:** Turso. Env: `DATABASE_URL` + `DATABASE_AUTH_TOKEN` in `.env.local` (see `.env.example`). App entry: `getDb()` in `src/shared/db/index.ts` — throws if `DATABASE_URL` is unset (no silent local SQLite fallback).

**Archived local DBs (`archive/db/`):** Stale snapshots only. Read `archive/db/README.md` before touching that folder. Files there had taxonomy / consolidation / `transaction_type` work that was **not** applied to Turso unless the user later asked to sync. Treat them like a sealed box: inspect only if asked; never use as the live DB.

| Path | Agent rule |
|------|------------|
| `archive/db/*.db` | Do **not** open for reads/writes as the app DB |
| `data/jayrr-budget.db` | Must not exist as a live DB; if present, archive it |
| `.env.local` Turso URL | Always the target for hygiene, backfills, audits |

**Scripts — required pattern:** load env before any DB client:

```ts
import { config } from "dotenv";
config({ path: ".env.local" });
```

Never hardcode `file:./data/jayrr-budget.db` or `createClient({ url: "file:..." })` unless the user explicitly asks to restore from archive.

**Hygiene / backfills (always Turso when `.env.local` is loaded):**

- Taxonomy only: `npx tsx scripts/run-category-hygiene.ts`
- Hygiene + AI enrichment: `npx tsx scripts/run-hygiene-enrichment.ts`
- **`transaction_type` only:** `npx tsx scripts/backfill-transaction-types.ts`
- **Verify before/after:** `npx tsx scripts/check-transaction-types.ts` (read-only); add `--run` to backfill
- Before mutating: print/confirm the URL is `libsql://…` (Turso), not `file:`

### `transaction_type` facet (cash-flow labels)

Separate from spend-tree **section** labels and from dimensional **type** (AI, Subscription, Fee, etc.).

| Piece | Location |
|-------|----------|
| Facet values | `income`, `transfers`, `expenses` on `transaction_labels.role = "transaction_type"` |
| Seed | `src/domains/enrichment/domain/seedTaxonomy.ts` |
| Slugs | `txn-type-income`, `txn-type-transfers`, `txn-type-expenses` via `transactionTypeSlug()` in `transactionTypes.ts` |
| Backfill logic | `src/domains/enrichment/application/backfillTransactionTypes.ts` |
| Hygiene stage | `category-hygiene:transaction-types` in `runCategoryHygienePipeline.ts` |
| UI column | `TransactionsDataTable.tsx` — **Transaction type** (not the old **Type** column) |

**Agent rules for this work:**

1. **Never** reuse bare slugs `income` / `transfers` / `expenses` for `transaction_type` nodes — they collide with spend-tree **section** nodes (`Income`, `Transfers`). Always use `transactionTypeSlug()`.
2. After any backfill, expect **exactly one** `transaction_type` label per transaction (count must equal `transactions` count).
3. Do **not** re-add Income / Transfers / Expenses to the old `type` facet seed; legacy `type` labels with those names are stripped by the backfill.
4. Remote Turso: do **not** run `PRAGMA busy_timeout` (local SQLite only).
5. If the user says labels are missing on `/transactions`, first check Turso with `check-transaction-types.ts` — a prior run may have hit `file:./data/jayrr-budget.db` instead of `.env.local`.

**Rare restore (user must ask):**  
`LOCAL_DATABASE_URL=file:./archive/db/jayrr-budget.db node scripts/push-local-to-turso.mjs` — overwrites remote; do not run unprompted.

**Cursor rule:** `.cursor/rules/turso-database.mdc` applies when editing archive/db, scripts, or `src/shared/db`.

## Turso performance (required for agents)

Turso is remote. **Every** `await db.select/insert/update/delete` is a network round trip (~50–200ms). Local SQLite hid this; the same loop on Turso multiplies into minutes.

### What burned us

`applySpendDimensions` used to call `upsertTaxonomyNode` / enrichment selects / label delete+insert **inside** the per-transaction match loop. ~1k matches × ~6–10 round trips → multi-minute hang (killed after ~7 min). Same class of bug: `setTxnRoleNode` (select + update per label) inside rewrite merges.

### Rules when writing or running DB jobs

1. **Never** call `upsertTaxonomyNode` / `ensureNamedNode` inside a per-row loop without an in-memory cache keyed by `facet|slug|parent`.
2. **Prefetch** related tables once (`transaction_enrichment` ids, `transaction_labels` by role) into `Set`/`Map` — do not `select … where transaction_id = ?` per row.
3. **Resolve unique trees once** before the loop (e.g. all distinct `section|category|subcategory` triples from rules), then reuse node ids.
4. Prefer **set-based SQL** (`UPDATE … WHERE node_id IN (…)`, `INSERT … SELECT`) for renames/splits of a few labels. Do **not** run full `run-category-hygiene` / `applySpendDimensions` for a one-off taxonomy rename (e.g. split "Rideshare & Transit" → Rideshare + Transit).
5. Writes in `applySpendDimensions` go through `@libsql/client` **`batch()`** after an in-memory decide pass. Copy that pattern; do not reintroduce per-row awaits.
6. **Kill and redesign** any Turso script that sits >~60s with no progress logs; do not leave it running hoping it finishes.
7. Reference: `src/domains/enrichment/application/applySpendDimensions.ts` (cache + prefetch + uniqueTrees + batched writes).

### Small taxonomy fixes (preferred path)

```text
dotenv → .env.local → createClient(Turso)
→ few SQL statements (ensure nodes + UPDATE labels)
→ print before/after counts
```

Target: seconds, not minutes.