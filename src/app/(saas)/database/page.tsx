"use client";

import { DbExplorer } from "@/domains/db-explorer/ui/DbExplorer";
import { api } from "@convex/_generated/api";
import { useConvexAuth, useQuery } from "convex/react";

export default function DatabasePage() {
  const { isAuthenticated } = useConvexAuth();
  const me = useQuery(api.users.me, isAuthenticated ? {} : "skip");

  if (me === undefined || me === null) {
    return (
      <p className="text-sm text-[var(--muted-foreground)]">Loading…</p>
    );
  }

  if (me.role !== "admin") {
    return (
      <div className="mx-auto max-w-md space-y-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-5 py-6 text-center">
        <h1 className="text-lg font-semibold tracking-tight">Admin only</h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          The database explorer is limited to admin accounts.
        </p>
      </div>
    );
  }

  return <DbExplorer />;
}
