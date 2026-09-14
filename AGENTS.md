<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Database (Convex) — agent context

**Source of truth:** Convex project `jayrr-budget` (team `jayrr-dev`). Env: `NEXT_PUBLIC_CONVEX_URL` (+ `CONVEX_DEPLOYMENT` for CLI) in `.env.local`.

**Auth:** Convex Auth (email + password via `@convex-dev/auth`). `convex/auth.config.ts` validates tokens from this deployment (`CONVEX_SITE_URL`). Every private ledger row is scoped by `userId` (`convex/lib/auth.ts` → `requireUser` / `getAuthUserId`). Never trust a client-supplied user id.

**App entry:** Convex React hooks (`useQuery` / `useMutation`) with `ConvexAuthNextjsProvider`, and `getAuthenticatedConvexClient()` in `src/shared/convex/httpClient.server.ts` for Next API routes.

| Path | Agent rule |
|------|------------|
| `convex/` | Live schema, queries, mutations (must call requireUser) |
| `archive/db/*.db` | Sealed local SQLite — inspect only if asked |
| `DATABASE_URL` Turso | Legacy scripts only |

**Dev workflow:**

```bash
npx convex dev
npm run dev
```

**First login after import:** UI runs `migrations.reassignAllLedgersToCurrentUser` once (localStorage-guarded) so imported rows attach to the Password user.

### Live Convex modules

| Area | Convex file |
|------|-------------|
| Auth | `convex/auth.ts`, `convex/http.ts`, `convex/auth.config.ts` |
| Auth helpers | `convex/lib/auth.ts`, `convex/users.ts` |
| Backfill | `convex/migrations.ts` |
| Dashboard / loans | `convex/dashboard.ts` |
| Analysis | `convex/analysis.ts` |
| Modules / tags / statements | `convex/modules.ts`, `transactions.ts`, `statements.ts` |

### AI security

- `/api/canvas/chat` and statement upload require a Convex Auth session.
- Budget context loaded via authenticated Convex client (owner-only).
- OpenRouter/Mistral keys stay server-only; canvas route rate-limits per userId.
