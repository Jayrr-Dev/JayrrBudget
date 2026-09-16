"use client";

import { IssuesManager } from "@/domains/issues/ui/IssuesManager";

export default function IssuesPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="type-page">
          Issues
        </h1>
        <p className="type-lead">
          Problems the app caught, plus ones you report yourself.
        </p>
      </div>
      <IssuesManager />
    </div>
  );
}
