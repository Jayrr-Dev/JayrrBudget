"use client";

import { Button } from "@/components/ui/button";
import { PiggyPageStatus } from "@/domains/ledger-ai/ui/PiggyPageStatus";
import Link from "next/link";

const DESTINATIONS = [
  { href: "/", label: "Overview" },
  { href: "/accounts", label: "Accounts" },
  { href: "/transactions", label: "Transactions" },
  { href: "/statements", label: "Statements" },
  { href: "/canvas", label: "Canvas" },
  { href: "/profile", label: "Profile" },
] as const;

export function NotFoundScreen() {
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-lg flex-col items-center justify-center px-4 py-16 text-center">
      <p className="type-kicker">404</p>
      <h1 className="type-page mt-2">This page wandered off</h1>
      <p className="sr-only">
        That URL is not in the app. Use a link below to get back.
      </p>
      <div className="mt-8">
        <PiggyPageStatus
          mood="sad"
          label="Lost"
          showDots={false}
          iconClassName="size-28"
        />
      </div>
      <p className="mt-6 text-sm text-muted-foreground">
        Piggy cannot find that path. Pick a real page.
      </p>
      <div className="mt-8">
        <Button size="lg" render={<Link href="/" />}>
          Go to overview
        </Button>
      </div>
      <nav
        aria-label="Nearby pages"
        className="mt-6 flex flex-wrap items-center justify-center gap-2"
      >
        {DESTINATIONS.map((item) => (
          <Button
            key={item.href}
            variant="outline"
            size="sm"
            render={<Link href={item.href} />}
          >
            {item.label}
          </Button>
        ))}
      </nav>
    </div>
  );
}
