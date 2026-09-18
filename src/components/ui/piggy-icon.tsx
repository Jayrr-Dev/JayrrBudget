import { cn } from "@/lib/utils";
import Image from "next/image";

export const PIGGY_ICON_NAMES = [
  "overview",
  "accounts",
  "transactions",
  "merchants",
  "classifications",
  "analysis",
  "statements",
  "canvas",
  "issues",
  "pings",
  "database",
  "modules",
  "service",
  "users",
  "revenue",
  "budgets",
  "profile",
  "logout",
  "sheet",
  "notes",
  "menu",
  "close",
] as const;

export type PiggyIconName = (typeof PIGGY_ICON_NAMES)[number];

export function isPiggyIconName(value: string): value is PiggyIconName {
  return (PIGGY_ICON_NAMES as readonly string[]).includes(value);
}

/** Decorative artwork; the containing link/button supplies its accessible name. */
export function PiggyIcon({
  name,
  className,
}: {
  name: PiggyIconName;
  className?: string;
}) {
  return (
    <Image
      src={`/icons/piggy/${name}.svg`}
      alt=""
      aria-hidden
      width={48}
      height={48}
      unoptimized
      draggable={false}
      className={cn("size-6 shrink-0 object-contain", className)}
    />
  );
}
