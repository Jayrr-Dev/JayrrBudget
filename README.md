# Jev's Budget

A personal budget ledger. You upload a bank statement, sort the charges, and each login only sees its own books.

The hosted app is at [jayrr-budget.vercel.app](https://jayrr-budget.vercel.app).

## What you can do

The home screen lists chequing, credit, and loan balances, plus the latest statement date. Transactions can be searched, tagged, and sorted into your own categories. Analysis charts spending over time. Budgets are caps you can edit.

Statements come in as a PDF or a photo. Reading the scan and suggesting categories needs Mistral and OpenRouter keys. Without those keys, the rest of the ledger still runs. There is a canvas for loose notes, and reminders that can show up as a toast, email, popup, or banner.

Sign-in is email and password. Google works too if you add those Convex env vars. One login, one ledger. There is no shared household.

## Run it locally

You need Node.js and a [Convex](https://convex.dev) account.

```bash
cp .env.example .env.local
npx convex dev
npm run dev
```

Put `NEXT_PUBLIC_CONVEX_URL` in `.env.local`. Convex Auth also needs `JWT_PRIVATE_KEY` and `JWKS` on the Convex dashboard. The setup steps are in the [Convex Auth docs](https://labs.convex.dev/auth/setup).

Then open `/sign-in` and create an account. If some imported rows have no owner, that first sign-in attaches them to you.

Other names (AI keys, Google, password-reset email) are listed in `.env.example`. Leave the real values out of git.

## Deploy

The live app is Next.js on Vercel, with Convex as the database.

Set `NEXT_PUBLIC_CONVEX_URL` on Vercel. For production, run `npx convex deploy` and put the auth keys on that Convex deployment. Server-only keys such as `MISTRAL_API_KEY` and `OPENROUTER_API_KEY` stay in env, not in the repo.

Older Turso scripts are still in `scripts/`. The running app does not use them.

## Stack

Next.js App Router, TypeScript, and Tailwind. Convex holds the ledger and the auth. Statement scans use Mistral. The in-app chat uses OpenRouter.

## License

[Apache License 2.0](LICENSE).
