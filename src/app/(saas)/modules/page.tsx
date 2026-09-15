"use client";

import { ModuleManager } from "@/domains/modules/ui/ModuleManager";
import { api } from "@convex/_generated/api";
import { useConvexAuth, useQuery } from "convex/react";

export default function ModulesPage() {
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
          Only admins can turn features on or off.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header className="space-y-1 border-b border-[var(--border)] pb-6">
        <h1 className="text-3xl font-semibold tracking-tight">Modules</h1>
        <p className="text-[var(--muted-foreground)]">
          Turn app features on or off for everyone.
        </p>
      </header>
      <ModuleManager />
    </div>
  );
}
