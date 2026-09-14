# JayrrBudget

Personal budgeting app: **Next.js** on **Vercel**, **Convex** for the live ledger, **Convex Auth** (email + password), plus optional statement OCR (Mistral) and canvas AI (OpenRouter).

## Auth

1. Install and init Convex Auth (`JWT_PRIVATE_KEY` + `JWKS` on the Convex dashboard). See [Convex Auth setup](https://labs.convex.dev/auth/setup).
2. Set `NEXT_PUBLIC_CONVEX_URL` (see `.env.example`).
3. Sign up once at `/sign-in`. The app remaps imported ledger rows to that user (`migrations.reassignAllLedgersToCurrentUser`).

Each user gets a private ledger (`userId` on every row). There is no shared household model yet.

## Local setup

```bash
cp .env.example .env.local
# fill NEXT_PUBLIC_CONVEX_URL (+ AI keys as needed)
npx convex dev
npm run dev
```

## Stack

- Next.js App Router + TypeScript + Tailwind
- Convex (`jayrr-budget` under jayrr-dev)
- Convex Auth (Password provider)
- tldraw canvas at `/canvas`

## Deploy

- Vercel: `NEXT_PUBLIC_CONVEX_URL` (no Clerk keys)
- `npx convex deploy` and set `JWT_PRIVATE_KEY` + `JWKS` on the production Convex deployment
- Do not require Turso `DATABASE_URL` for the live app
