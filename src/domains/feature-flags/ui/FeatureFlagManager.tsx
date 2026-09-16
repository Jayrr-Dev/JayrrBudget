"use client";

import { api } from "@convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { Info } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
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
    <section className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          Feature flags
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-accent hover:bg-accent-subtle hover:text-accent"
                aria-label="About feature flags"
              >
                <Info className="size-3.5" />
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              side="bottom"
              sideOffset={8}
              className="w-80 gap-0 p-3.5"
            >
              <PopoverHeader className="gap-1.5">
                <PopoverTitle>What these change</PopoverTitle>
                <PopoverDescription className="leading-relaxed">
                  Your ledger stays private to you. Cloud tools only run when
                  you turn them on.
                </PopoverDescription>
              </PopoverHeader>
            </PopoverContent>
          </Popover>
        </h2>
      </div>
      <div className="space-y-2">
        {FEATURE_FLAG_KEYS.map((key) => (
          <FlagRow key={key} flagKey={key} enabled={Boolean(byKey.get(key))} />
        ))}
      </div>
    </section>
  );
}
