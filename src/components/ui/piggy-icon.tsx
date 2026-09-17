import { cn } from "@/lib/utils";
import Image from "next/image";

export type PiggyIconName =
  | "overview"
  | "accounts"
  | "transactions"
  | "merchants"
  | "classifications"
  | "analysis"
  | "statements"
  | "canvas"
  | "issues"
  | "pings"
  | "database"
  | "modules"
  | "service"
  | "users"
  | "revenue"
  | "budgets"
  | "profile"
  | "logout"
  | "sheet"
  | "notes"
  | "menu"
  | "close";

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
