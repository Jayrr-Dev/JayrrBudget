# JayrrBudget

Personal budgeting app: **Next.js** on **Vercel**, **SQLite** via Drizzle/libSQL, and **Plaid** for bank connections.

## Stack

- Next.js App Router + TypeScript + Tailwind
- SQLite through `@libsql/client` + Drizzle ORM
- Plaid Link (`transactions` product)

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

Open [http://localhost:3000](http://localhost:3000), connect a sandbox bank, then sync transactions.

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

## Privacy

This repo is private. Never commit `.env.local` or real Plaid access tokens.
