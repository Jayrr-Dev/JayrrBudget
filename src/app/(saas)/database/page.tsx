"use client";

import { DbExplorer } from "@/domains/db-explorer/ui/DbExplorer";
import { PageSpinner } from "@/components/ui/spinner";
import { api } from "@convex/_generated/api";
import { useConvexAuth, useQuery } from "convex/react";

export default function DatabasePage() {
  const { isAuthenticated } = useConvexAuth();
  const me = useQuery(api.users.me, isAuthenticated ? {} : "skip");

  if (me === undefined || me === null) {
    return <PageSpinner />;
  }

  if (me.role !== "admin") {
    return (
      <div className="mx-auto max-w-md space-y-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-5 py-6 text-center">
        <h1 className="text-lg font-semibold tracking-tight">Admin only</h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          Only admins can browse the database.
        </p>
      </div>
    );
  }

  return <DbExplorer />;
}
