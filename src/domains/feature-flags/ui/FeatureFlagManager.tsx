"use client";

import { api } from "@convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { Switch } from "@/components/ui/switch";
import { FEATURE_FLAG_COPY, FEATURE_FLAG_KEYS, type FeatureFlagKey } from "@/domains/feature-flags/domain/keys";

function FlagRow({ flagKey, enabled }: { flagKey: FeatureFlagKey; enabled: boolean }) {
  const setFlag = useMutation(api.featureFlags.set);
  const copy = FEATURE_FLAG_COPY[flagKey];
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-[var(--border)] bg-[var(--background)] px-4 py-3">
      <div className="min-w-0 space-y-1">
        <p className="font-medium">{copy.name}</p>
        <p className="text-sm text-[var(--muted-foreground)]">{copy.description}</p>
      </div>
      <Switch
        size="lg"
        checked={enabled}
        onCheckedChange={(checked) => void setFlag({ key: flagKey, enabled: Boolean(checked) })}
      />
    </div>
  );
}

export function FeatureFlagManager() {
  const flags = useQuery(api.featureFlags.list, {});
  if (flags === undefined) {
    return <p className="text-sm text-[var(--muted-foreground)]">Loading feature flags…</p>;
  }
  const byKey = new Map(flags.map((row) => [row.key, row.enabled]));
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">Feature flags</h2>
        <p className="text-sm text-[var(--muted-foreground)]">
          Dual-run toggles. Encrypted ledger runs math in the browser. OCR and canvas stay Cloud Processing when enabled.
        </p>
      </div>
      <div className="space-y-2">
        {FEATURE_FLAG_KEYS.map((key) => (
          <FlagRow key={key} flagKey={key} enabled={Boolean(byKey.get(key))} />
        ))}
      </div>
    </section>
  );
}
