"use client";

import { IssuesManager } from "@/domains/issues/ui/IssuesManager";

export default function IssuesPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Issues
        </h1>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          Problems the app caught, plus ones you report yourself.
        </p>
      </div>
      <IssuesManager />
    </div>
  );
}
