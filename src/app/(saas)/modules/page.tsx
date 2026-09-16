"use client";

import { PageSpinner } from "@/components/ui/spinner";
import { FeatureFlagManager } from "@/domains/feature-flags/ui/FeatureFlagManager";
import { ModuleManager } from "@/domains/modules/ui/ModuleManager";
import { api } from "@convex/_generated/api";
import { useConvexAuth, useQuery } from "convex/react";

export default function ModulesPage() {
  const { isAuthenticated } = useConvexAuth();
  const me = useQuery(api.users.me, isAuthenticated ? {} : "skip");

  if (me === undefined || me === null) {
    return <PageSpinner />;
  }

  if (me.role !== "admin") {
    return (
      <div className="mx-auto max-w-md space-y-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-5 py-6 text-center">
        <h1 className="type-section">Admin only</h1>
        <p className="type-lead">Only admins can turn features on or off.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header className="space-y-2 border-b border-[var(--border)] pb-6">
        <h1 className="type-page">Modules</h1>
        <p className="type-lead">Turn app features on or off for everyone.</p>
      </header>
      <FeatureFlagManager />
      <ModuleManager />
    </div>
  );
}
