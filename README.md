# JayrrBudget

Personal budgeting app: **Next.js** on **Vercel**, **Convex** for the live ledger, **Clerk** for invite-only sign-in, plus optional statement OCR (Mistral) and canvas AI (OpenRouter).

## Auth (invite-only)

1. Create a Clerk application and enable the **Convex** integration / JWT template named `convex`.
2. Set env (see `.env.example`):
   - Next: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`
   - Convex dashboard: `CLERK_JWT_ISSUER_DOMAIN` = Clerk Frontend API URL
3. In Clerk Dashboard, **disable public sign-up** and invite users by email.
4. First sign-in creates your Convex `users` row and claims any pre-auth import rows (`migrations.claimUnownedData`).

Each user gets a private ledger (`userId` on every row). There is no shared household model yet.

## Local setup

```bash
cp .env.example .env.local
# fill Convex + Clerk keys
npx convex dev
npm run dev
```

## Stack

- Next.js App Router + TypeScript + Tailwind
- Convex (`jayrr-budget` under jayrr-dev)
- Clerk authentication
- tldraw canvas at `/canvas`

## Deploy

- Vercel: `NEXT_PUBLIC_CONVEX_URL`, Clerk publishable + secret keys
- `npx convex deploy` and set `CLERK_JWT_ISSUER_DOMAIN` on the production Convex deployment
- Do not require Turso `DATABASE_URL` for the live app
