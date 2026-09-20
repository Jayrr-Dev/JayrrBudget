"use client";

import { Switch } from "@/components/ui/switch";
import { FEATURE_FLAG_COPY } from "@/domains/feature-flags/domain/keys";
import { useFeatureFlags } from "@/domains/feature-flags/ui/useFeatureFlag";
import { api } from "@convex/_generated/api";
import { useMutation } from "convex/react";

export const CLOUD_PROCESSING_REQUIRED =
  "Turn on Cloud Processing, then retry.";

export function CloudProcessingSwitchCard({
  checked,
  disabled = false,
  dense = false,
  onCheckedChange,
}: {
  checked: boolean;
  disabled?: boolean;
  dense?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}) {
  const copy = FEATURE_FLAG_COPY.cloudProcessing;

  return (
    <div className="flex items-start justify-between gap-3 rounded-xl border border-border bg-muted/30 px-3 py-3">
      <div className="min-w-0 space-y-1">
        <p className="text-sm font-medium">{copy.name}</p>
        {dense ? null : (
          <p className="text-xs leading-relaxed text-muted-foreground">
            {copy.description}
          </p>
        )}
      </div>
      <Switch
        size="lg"
        aria-label={`Enable ${copy.name}`}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
      />
    </div>
  );
}

export function CloudProcessingSwitch() {
  const flags = useFeatureFlags();
  const setFlag = useMutation(api.featureFlags.set);

  return (
    <CloudProcessingSwitchCard
      checked={flags.cloudProcessing}
      disabled={flags.loading}
      onCheckedChange={(checked) =>
        void setFlag({ key: "cloudProcessing", enabled: Boolean(checked) })
      }
    />
  );
}
