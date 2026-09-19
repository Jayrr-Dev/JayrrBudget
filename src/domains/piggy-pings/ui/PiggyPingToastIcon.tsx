"use client";

import {
  isPiggyIconName,
  PiggyIcon,
  type PiggyIconName,
} from "@/components/ui/piggy-icon";
import type { PingToastTone } from "@/domains/piggy-pings/domain/pingToastTone";

const PIGGY_SRC: Record<PingToastTone, string> = {
  warn: "/piggy/warning.svg",
  over: "/piggy/over.svg",
  default: "/piggy/happy.svg",
};

function selectedIconName(icon?: string | null): PiggyIconName | null {
  if (!icon) return null;
  if (!isPiggyIconName(icon)) return null;
  return icon;
}

export function PiggyPingToastIcon({
  tone,
  icon,
}: {
  tone: PingToastTone;
  icon?: string | null;
}) {
  const selected = selectedIconName(icon);
  const art =
    tone === "default" ? (
      <PiggyIcon name={selected ?? "pings"} className="size-8" />
    ) : (
      <img
        src={PIGGY_SRC[tone]}
        alt=""
        width={48}
        height={48}
        draggable={false}
        className="size-12 object-contain"
      />
    );

  return (
    <span
      aria-hidden
      className="flex size-12 shrink-0 items-center justify-center overflow-visible rounded-xl bg-piggy-100"
    >
      {art}
    </span>
  );
}
