# JayrrBudget

Personal budgeting app: **Next.js** on **Vercel**, **SQLite** via Drizzle/libSQL, **Plaid** for banks, **manual PDF statements** (Mistral OCR + OpenRouter/Gemini), and **tldraw** for a budget canvas.

The UI is a client SPA (TanStack Query) over thin JSON APIs.

## Architecture (domain-driven)

```
src/
  app/                 # Next.js shell + thin HTTP adapters
  domains/
    banking/           # Plaid link, items, accounts
    transactions/      # history sync + Plaid → ledger mapping
    dashboard/         # aggregates + SPA dashboard
    canvas/            # tldraw budget map
  shared/
    db/                # Drizzle schema + client
    query/             # TanStack Query provider
    lib/               # tiny shared helpers
```

Each domain keeps `application/` (use-cases), `domain/` (pure types/mappers), `infrastructure/` (external clients), `queries/` (client fetchers), and `ui/` as needed. API routes only parse HTTP and call use-cases.

## Stack

- Next.js App Router + TypeScript + Tailwind
- SQLite through `@libsql/client` + Drizzle ORM
- Plaid Link (`transactions` product, 730-day history)
- tldraw canvas at `/canvas` (persisted in the browser)

## Local setup

1. Copy env template and add Plaid sandbox keys from [dashboard.plaid.com](https://dashboard.plaid.com):

```bash
cp .env.example .env.local
```

2. Create the SQLite schema:

```bash
npm run db:push
```

3. Start the app:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), connect a sandbox bank, then sync transactions. Use **Open canvas** or [http://localhost:3000/canvas](http://localhost:3000/canvas) for the tldraw board.

## Vercel + SQLite

Vercel serverless functions cannot keep a durable local `.db` file. For production:

1. Create a free [Turso](https://turso.tech) database (libSQL / SQLite).
2. Set `DATABASE_URL` and `DATABASE_AUTH_TOKEN` in the Vercel project.
3. Run `npm run db:push` against that remote URL once.
4. Also set `PLAID_CLIENT_ID`, `PLAID_SECRET`, and `PLAID_ENV` in Vercel.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Local Next.js server |
| `npm run db:push` | Apply schema to SQLite |
| `npm run db:studio` | Browse data in Drizzle Studio |
| `npm run build` | Production build |

## Transaction history (2 years)

Link is configured with `transactions.days_requested = 730` (Plaid’s maximum).

1. If you already linked a bank before this change, click **Reset & re-link**, then **Connect bank** again.
2. After linking, use **Full history sync** — it pages through `/transactions/sync` (500/page), waits briefly if history is still warming up, and stores enriched fields (PFC categories, merchant, location, original description, counterparties).

Note: some institutions return less than 2 years even when requested. Sandbox data volume also varies by test institution.

## Privacy

This repo is private. Never commit `.env.local` or real Plaid access tokens.
