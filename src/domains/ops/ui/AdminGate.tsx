"use client";

import { PageSpinner } from "@/components/ui/spinner";
import { api } from "@convex/_generated/api";
import { useConvexAuth, useQuery } from "convex/react";
import type { ReactNode } from "react";

/** Blocks non-admin viewers with the same card used on Database / Modules. */
export function AdminGate({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useConvexAuth();
  const me = useQuery(api.users.me, isAuthenticated ? {} : "skip");

  if (me === undefined || me === null) {
    return <PageSpinner />;
  }

  if (me.role !== "admin") {
    return (
      <div className="mx-auto max-w-md space-y-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-5 py-6 text-center">
        <h1 className="type-section">Admin only</h1>
        <p className="type-lead">Only admins can open this page.</p>
      </div>
    );
  }

  return children;
}
