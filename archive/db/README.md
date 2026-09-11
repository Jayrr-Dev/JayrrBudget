# Archived SQLite (do not use)

<!-- AGENT CONTEXT: start -->
**For AI agents:** This folder is archival only. Live app data is **Turso** (`DATABASE_URL` + `DATABASE_AUTH_TOKEN` in `.env.local`). Project rules: `AGENTS.md` (Database section) and `.cursor/rules/turso-database.mdc`.

### What agents must do

1. **Do not** connect here for audits, Movati fixes, taxonomy rewrites, consolidations, or `transaction_type` backfills.
2. Always `dotenv` → `.env.local` → `getDb()` / Turso client before any DB work.
3. Confirm target URL is `libsql://…turso.io` before writes.
4. If the user asks to “update the DB” / “run hygiene” / “backfill”, run against **Turso**, not these files.
5. Only open these files if the user explicitly asks to inspect or restore the archive.

### What went wrong historically

Agents wrote taxonomy changes to a local `data/jayrr-budget.db` while `npm run dev` read Turso. The two copies diverged. Local DBs were moved here on **2026-09-11** so that mistake is harder to repeat.
<!-- AGENT CONTEXT: end -->

These files are **stale local snapshots** from before Turso became the live database.

| File | Notes |
|------|--------|
| `jayrr-budget.db` | Had taxonomy rewrites, consolidations, and `transaction_type` backfill that were **never** applied to Turso (as of archive date) |
| `jayrr-budget.copy.db` | Older backup copy |

## Humans

- **Do not** open these with `getDb()`, `createClient({ url: "file:..." })`, or scripts that omit `.env.local`.
- **Live data** is Turso: `DATABASE_URL` + `DATABASE_AUTH_TOKEN` in `.env.local`.
- To refresh Turso after code changes: `npx tsx scripts/run-category-hygiene.ts` (or full `scripts/run-hygiene-enrichment.ts`).
- To restore from archive into Turso (rare): `LOCAL_DATABASE_URL=file:./archive/db/jayrr-budget.db node scripts/push-local-to-turso.mjs` — only if you intentionally want to overwrite remote with this snapshot.

Archived: 2026-09-11.

## Performance note (agents)

Do not “replay” taxonomy work by running full hygiene against these files or by copying their per-row rewrite style onto Turso. Turso needs cached node lookups + set-based SQL — see `AGENTS.md` → **Turso performance** and `.cursor/rules/turso-database.mdc`.
