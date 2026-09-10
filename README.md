# JayrrBudget

Personal budgeting app: **Next.js** on **Vercel**, **SQLite** via Drizzle/libSQL, **manual PDF statements** (Mistral OCR + OpenRouter/Gemini), and **tldraw** for a budget canvas.

The UI is a client SPA (TanStack Query) over thin JSON APIs.

## Architecture (domain-driven)

```
src/
  app/                 # Next.js shell + thin HTTP adapters
  domains/
    statements/        # PDF OCR, parse, ledger import
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
- Statement PDFs via Mistral OCR + OpenRouter
- tldraw canvas at `/canvas` (persisted in the browser)

## Local setup

1. Copy env template and add Mistral + OpenRouter keys:

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

Open [http://localhost:3000](http://localhost:3000) and import a statement PDF. Use **Open canvas** or [http://localhost:3000/canvas](http://localhost:3000/canvas) for the tldraw board.

## Vercel + SQLite

Vercel serverless functions cannot keep a durable local `.db` file. For production:

1. Create a free [Turso](https://turso.tech) database (libSQL / SQLite).
2. Set `DATABASE_URL` and `DATABASE_AUTH_TOKEN` in the Vercel project.
3. Run `npm run db:push` against that remote URL once.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Local Next.js server |
| `npm run db:push` | Apply schema to SQLite |
| `npm run db:studio` | Browse data in Drizzle Studio |
| `npm run build` | Production build |

## Privacy

This repo is private. Never commit `.env.local`.
